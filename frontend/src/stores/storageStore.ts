import { create } from 'zustand'
import type { Storage, StorageMove, StorageMoveAction } from '@/types'
import { db, loadAll } from '@/hooks/usePersistentStore'
import { isSameSlot, storageSlotText } from '@/utils/codec'
import { uid } from '@/utils/id'

export type SavePlacementStatus = 'placed' | 'moved' | 'unchanged' | 'conflict'
export type TakeOutStatus = 'takenout' | 'missing'

export interface SavePlacementResult {
  status: SavePlacementStatus
  storage: Storage
  conflicts: Storage[]
}

export interface TakeOutResult {
  status: TakeOutStatus
  storage: Storage | null
}

export interface StorageState {
  rows: Storage[]
  moves: StorageMove[]
  loaded: boolean
  hydrate: () => Promise<void>
  /** 入柜或换柜；相同柜位不写新记录，柜位冲突时不写任何数据 */
  savePlacement: (row: Storage, occurredAt?: string) => Promise<SavePlacementResult>
  /** 出柜：删除当前位置并保留出柜记录 */
  takeOut: (id: string, handler?: string, occurredAt?: string) => Promise<TakeOutResult>
}

function sortMoves(rows: StorageMove[]): StorageMove[] {
  return rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

function buildMove(
  storage: Storage,
  action: StorageMoveAction,
  fromSlot: string | null,
  toSlot: string | null,
  occurredAt: string
): StorageMove {
  return {
    id: uid('move'),
    specimenId: storage.specimenId,
    action,
    fromSlot,
    toSlot,
    method: storage.method,
    handler: storage.handler,
    occurredAt
  }
}

export const storageStore = create<StorageState>((set) => ({
  rows: [],
  moves: [],
  loaded: false,
  hydrate: async () => {
    const [rows, moves] = await Promise.all([loadAll<Storage>(db.storages), loadAll<StorageMove>(db.storageMoves)])
    rows.sort((a, b) => (a.cabinet + a.drawer + a.box + a.slot).localeCompare(`${b.cabinet}${b.drawer}${b.box}${b.slot}`))
    set({ rows, moves: sortMoves(moves), loaded: true })
  },
  savePlacement: async (row, occurredAtInput) => {
    const occurredAt = occurredAtInput ?? new Date().toISOString()

    return db.transaction('rw', db.storages, db.storageMoves, async () => {
      const current = await db.storages.get(row.id)
      const target = { ...row }
      const sameSpecimen = current?.specimenId === target.specimenId
      const existing = sameSpecimen ? current : (await db.storages.where('specimenId').equals(target.specimenId).first()) ?? null
      if (existing) {
        target.id = existing.id
      }

      const effective: Storage = { ...target, id: existing?.id ?? target.id }
      const conflicts = (await db.storages.toArray()).filter(
        (item) => item.specimenId !== effective.specimenId && storageSlotText(item) === storageSlotText(effective)
      )
      if (conflicts.length > 0) {
        return { status: 'conflict' as const, storage: existing ?? effective, conflicts }
      }

      if (existing && isSameSlot(existing, effective)) {
        return { status: 'unchanged' as const, storage: existing, conflicts: [] }
      }

      await db.storages.put(effective)
      const move = buildMove(
        effective,
        existing ? 'move' : 'place',
        existing ? storageSlotText(existing) : null,
        storageSlotText(effective),
        occurredAt
      )
      await db.storageMoves.put(move)

      const rows = await db.storages.toArray()
      rows.sort((a, b) => (a.cabinet + a.drawer + a.box + a.slot).localeCompare(`${b.cabinet}${b.drawer}${b.box}${b.slot}`))
      const moves = await db.storageMoves.toArray()
      set({ rows, moves: sortMoves(moves) })

      return { status: existing ? ('moved' as const) : ('placed' as const), storage: effective, conflicts: [] }
    })
  },
  takeOut: async (id, handler, occurredAtInput) => {
    const occurredAt = occurredAtInput ?? new Date().toISOString()

    return db.transaction('rw', db.storages, db.storageMoves, async () => {
      const current = await db.storages.get(id)
      if (!current) {
        return { status: 'missing' as const, storage: null }
      }

      const movedAt: Storage = { ...current, handler: handler?.trim() || current.handler }
      const move = buildMove(movedAt, 'takeout', storageSlotText(current), null, occurredAt)
      await db.storageMoves.put(move)
      await db.storages.delete(current.id)

      const rows = await db.storages.toArray()
      rows.sort((a, b) => (a.cabinet + a.drawer + a.box + a.slot).localeCompare(`${b.cabinet}${b.drawer}${b.box}${b.slot}`))
      const moves = await db.storageMoves.toArray()
      set({ rows, moves: sortMoves(moves) })

      return { status: 'takenout' as const, storage: movedAt }
    })
  }
}))
