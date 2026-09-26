import { create } from 'zustand'
import type { Storage, StorageMove, StorageMoveType } from '@/types'
import { db, loadAll } from '@/hooks/usePersistentStore'
import { uid } from '@/utils/id'

/** 柜位冲突：目标插位已被另一份标本占用，事务回滚后抛出 */
export class SlotConflictError extends Error {
  occupant: Storage

  constructor(occupant: Storage) {
    super('slot conflict')
    this.name = 'SlotConflictError'
    this.occupant = occupant
  }
}

export interface StorageState {
  rows: Storage[]
  moves: StorageMove[]
  loaded: boolean
  hydrate: () => Promise<void>
  /**
   * 保存保藏位置：
   * - 与既有记录柜位相同：不更新、不写变化记录
   * - 目标柜位被其他标本占用：抛出 SlotConflictError，当前位置与已有记录均不变
   * - 新入柜写「入柜」记录，更换柜位写「挪柜」记录，与位置更新同一事务提交
   */
  save: (row: Storage) => Promise<'入柜' | '挪柜' | 'unchanged'>
  /** 出柜：删除当前位置并写「出柜」记录 */
  remove: (id: string, handler?: string) => Promise<void>
  /** 删除某标本的全部保藏位置（如级联删除），逐条写「出柜」记录 */
  removeBySpecimen: (specimenId: string, handler?: string) => Promise<void>
  /** 某标本的柜位变化记录，按时间从近到远 */
  movesOf: (specimenId: string) => StorageMove[]
}

/** 判断两条记录是否指向同一柜位 */
function sameSlot(a: Storage, b: Storage): boolean {
  return (
    a.cabinet.toUpperCase() === b.cabinet.toUpperCase() &&
    a.drawer === b.drawer &&
    a.box === b.box &&
    a.slot === b.slot
  )
}

function buildMove(storage: Storage, type: StorageMoveType): StorageMove {
  const now = new Date()
  return {
    id: uid('move'),
    specimenId: storage.specimenId,
    type,
    method: storage.method,
    cabinet: storage.cabinet,
    drawer: storage.drawer,
    box: storage.box,
    slot: storage.slot,
    changedAt: now.toISOString(),
    changedDate: now.toISOString().slice(0, 10),
    handler: storage.handler
  }
}

export const storageStore = create<StorageState>((set, get) => ({
  rows: [],
  moves: [],
  loaded: false,
  hydrate: async () => {
    const [rows, moves] = await Promise.all([loadAll<Storage>(db.storages), loadAll<StorageMove>(db.storageMoves)])
    rows.sort((a, b) => (a.cabinet + a.drawer + a.box + a.slot).localeCompare(`${b.cabinet}${b.drawer}${b.box}${b.slot}`))
    moves.sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    set({ rows, moves, loaded: true })
  },
  save: async (row) => {
    const result = await db.transaction('rw', db.storages, db.storageMoves, async () => {
      const all = await db.storages.toArray()
      const existing = all.find((item) => item.specimenId === row.specimenId)

      // 同一柜位重复保存：当前位置与已有记录都保持不变
      if (existing && sameSlot(existing, row)) {
        return 'unchanged' as const
      }

      const occupant = all.find((item) => item.specimenId !== row.specimenId && sameSlot(item, row))
      if (occupant) {
        throw new SlotConflictError(occupant)
      }

      // 保留既有记录 id，更换柜位时原位置直接被覆盖
      const stored: Storage = existing ? { ...row, id: existing.id } : row
      const type: StorageMoveType = existing ? '挪柜' : '入柜'
      await db.storages.put(stored)
      await db.storageMoves.put(buildMove(stored, type))
      return type
    })
    await get().hydrate()
    return result
  },
  remove: async (id, handler = '') => {
    await db.transaction('rw', db.storages, db.storageMoves, async () => {
      const existing = await db.storages.get(id)
      if (!existing) return
      await db.storages.delete(id)
      await db.storageMoves.put(buildMove({ ...existing, handler: handler.trim() || existing.handler }, '出柜'))
    })
    await get().hydrate()
  },
  removeBySpecimen: async (specimenId, handler = '') => {
    await db.transaction('rw', db.storages, db.storageMoves, async () => {
      const targets = await db.storages.where('specimenId').equals(specimenId).toArray()
      await Promise.all(
        targets.map(async (storage) => {
          await db.storages.delete(storage.id)
          await db.storageMoves.put(buildMove({ ...storage, handler: handler.trim() || storage.handler }, '出柜'))
        })
      )
    })
    await get().hydrate()
  },
  movesOf: (specimenId) =>
    get()
      .moves.filter((move) => move.specimenId === specimenId)
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
}))
