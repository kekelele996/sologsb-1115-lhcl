/** 保藏方式 */
export const STORAGE_METHODS = ['针插', '浸液', '玻片', '干燥'] as const
export type StorageMethod = (typeof STORAGE_METHODS)[number]

/** Storage 保藏位置 */
export interface Storage {
  id: string
  specimenId: string
  method: StorageMethod
  /** 标本柜编号 */
  cabinet: string
  /** 抽屉号 */
  drawer: number
  /** 标本盒号 */
  box: number
  /** 插位序号 */
  slot: number
  storedDate: string
  handler: string
}

/** 柜位变化类型 */
export const STORAGE_MOVE_ACTIONS = ['place', 'move', 'takeout'] as const
export type StorageMoveAction = (typeof STORAGE_MOVE_ACTIONS)[number]

/** 标本柜位变化记录 */
export interface StorageMove {
  id: string
  specimenId: string
  action: StorageMoveAction
  /** 变化前柜位；入柜时为空 */
  fromSlot: string | null
  /** 变化后柜位；出柜时为空 */
  toSlot: string | null
  method: StorageMethod
  handler: string
  /** ISO 时间，用于按时间排序和展示 */
  occurredAt: string
}
