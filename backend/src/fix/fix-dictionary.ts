// FIX 4.4 tag constants and message type values
// Ref: https://fixprotocol.org/specifications/fix44

export const Tag = {
  // Standard header
  BeginString: 8,
  BodyLength: 9,
  MsgType: 35,
  SenderCompID: 49,
  TargetCompID: 56,
  MsgSeqNum: 34,
  SendingTime: 52,

  // Session-level
  HeartBtInt: 108,
  EncryptMethod: 98,
  TestReqID: 112,
  GapFillFlag: 123,
  NewSeqNo: 36,
  BeginSeqNo: 7,
  EndSeqNo: 16,
  ResetSeqNumFlag: 141,
  RefSeqNum: 45,
  RefMsgType: 372,
  SessionRejectReason: 373,

  // Order fields
  ClOrdID: 11,
  Symbol: 55,
  Side: 54,
  OrderQty: 38,
  Price: 44,
  OrdType: 40,
  TimeInForce: 59,
  TransactTime: 60,
  ExDestination: 100,
  HandlInst: 21,
  Account: 1,

  // ExecutionReport fields
  ExecID: 17,
  ExecType: 150,
  OrdStatus: 39,
  LeavesQty: 151,
  CumQty: 14,
  AvgPx: 6,
  OrderID: 37,
  LastQty: 32,
  LastPx: 31,

  // Reject/text
  Text: 58,
  CheckSum: 10,
} as const;

export type TagKey = keyof typeof Tag;

export const MsgType = {
  Heartbeat: "0",
  TestRequest: "1",
  ResendRequest: "2",
  Reject: "3",
  SequenceReset: "4",
  Logout: "5",
  Logon: "A",
  NewOrderSingle: "D",
  ExecutionReport: "8",
  OrderCancelRequest: "F",
  OrderCancelReject: "9",
} as const;

export type MsgTypeValue = (typeof MsgType)[keyof typeof MsgType];

// Side field values
export const Side = {
  Buy: "1",
  Sell: "2",
} as const;

// OrdType field values
export const OrdType = {
  Market: "1",
  Limit: "2",
} as const;

// OrdStatus field values
export const OrdStatus = {
  New: "0",
  PartiallyFilled: "1",
  Filled: "2",
  Canceled: "4",
  Rejected: "8",
} as const;

// ExecType field values
export const ExecType = {
  New: "0",
  PartialFill: "1",
  Fill: "F",
  Canceled: "4",
  Rejected: "8",
  Trade: "F",
} as const;

// TimeInForce values
export const TimeInForce = {
  Day: "0",
  GoodTillCancel: "1",
  ImmediateOrCancel: "3",
  FillOrKill: "4",
} as const;

// EncryptMethod values
export const EncryptMethod = {
  None: "0",
} as const;
