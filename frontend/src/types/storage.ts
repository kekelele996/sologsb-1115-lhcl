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

/** 位置变化类型：入柜 / 挪柜位 / 出柜 */
export const STORAGE_MOVE_TYPES = ['入柜', '挪柜', '出柜'] as const
export type StorageMoveType = (typeof STORAGE_MOVE_TYPES)[number]

/** StorageMove 柜位变化记录：每次成功入柜、挪柜或出柜留痕 */
export interface StorageMove {
  id: string
  specimenId: string
  /** 变化类型 */
  type: StorageMoveType
  method: StorageMethod
  /** 变化后的柜位（出柜时为出柜前所在柜位） */
  cabinet: string
  drawer: number
  box: number
  slot: number
  /** 变化时间，ISO 字符串，便于按时间先后排序 */
  changedAt: string
  /** 业务日期（入柜/挪柜日期或出柜日期） */
  changedDate: string
  /** 经手人 */
  handler: string
}
