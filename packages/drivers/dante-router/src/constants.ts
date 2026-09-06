export const PROTOCOL_ID = 0x27ff;

export const SERVICE_ARC = "_netaudio-arc._udp.local.";
export const SERVICE_CMC = "_netaudio-cmc._udp.local.";
export const SERVICE_DBC = "_netaudio-dbc._udp.local.";
export const SERVICES = [SERVICE_ARC, SERVICE_CMC, SERVICE_DBC] as const;

export const DEFAULT_ARC_PORT = 4440;

export const OPCODE_CHANNEL_COUNT = 0x1000;
export const OPCODE_DEVICE_NAME_SET = 0x1001;
export const OPCODE_DEVICE_NAME = 0x1002;
export const OPCODE_DEVICE_INFO = 0x1003;
export const OPCODE_DEVICE_SETTINGS = 0x1100;
export const OPCODE_DEVICE_SETTINGS_SET = 0x1101;
export const OPCODE_TX_CHANNEL_INFO = 0x2000;
export const OPCODE_TX_CHANNEL_NAMES = 0x2010;
export const OPCODE_TX_CHANNEL_NAME_SET = 0x2013;
export const OPCODE_RX_CHANNELS = 0x3000;
export const OPCODE_RX_CHANNEL_NAME_SET = 0x3001;
export const OPCODE_SUBSCRIPTION_ADD = 0x3010;
export const OPCODE_SUBSCRIPTION_REMOVE = 0x3014;

export const RX_RECORD_SIZE = 20;
export const TX_RECORD_SIZE = 8;
export const TX_FRIENDLY_RECORD_SIZE = 6;
export const RESPONSE_HEADER_SIZE = 10;
export const BODY_HEADER_SIZE = 2;

export const RESULT_CODE_SUCCESS = 0x0001;

export const CHANNELS_PER_RX_PAGE = 16;
export const CHANNELS_PER_TX_PAGE = 32;
