/**
 * FloodyPredict - Direct Offline Bluetooth Emergency Chat Types & Protocols
 * Version 1.0.0
 */

export type BluetoothState =
  | 'unsupported'
  | 'poweredOff'
  | 'poweredOn'
  | 'unauthorized'
  | 'resetting'
  | 'unknown';

export type ConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'reconnecting'
  | 'failed';

export type MessagePriority = 'normal' | 'emergency';

export type MessageDeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed';

export type MessageType =
  | 'msg'       // Standard chat text message
  | 'quick'     // Emergency quick message
  | 'sos'       // Critical SOS alert
  | 'ack'       // Delivery acknowledgement
  | 'ping'      // Liveness probe
  | 'pong'      // Liveness response
  | 'ident';    // Peer identity exchange

export interface BluetoothUserIdentity {
  id: string;          // e.g. "FloodUser-4821"
  nickname: string;    // Custom display name or default
  createdAt: number;
}

export interface BluetoothDevicePeer {
  id: string;          // Unique internal ID (UUID or Device Address)
  name: string;        // Advertised name (e.g., "FloodUser-4821")
  nickname?: string;
  rssi?: number;       // Signal strength in dBm
  lastSeen: number;
  isConnected: boolean;
  isBlocked?: boolean;
}

export interface BluetoothMessagePayload {
  v: number;                   // Protocol version = 1
  id: string;                  // Unique UUID
  type: MessageType;
  senderId: string;            // Sender ID (FloodUser-XXXX)
  senderNick: string;          // Sender Nickname
  recipientId?: string;        // Target recipient ID (optional for broadcast/direct)
  timestamp: number;           // Unix epoch timestamp (ms)
  priority: MessagePriority;
  content: string;             // Text message content (max 500 chars)
  ackForId?: string;           // If type === 'ack', the referenced message ID
}

export interface StoredMessage {
  id: string;
  conversationId: string;      // Peer device ID
  senderId: string;
  senderNick: string;
  isSelf: boolean;
  timestamp: number;
  priority: MessagePriority;
  type: MessageType;
  content: string;
  status: MessageDeliveryStatus;
  retryCount: number;
}

export interface ConversationThread {
  peerId: string;
  peerName: string;
  peerNickname?: string;
  lastMessage?: StoredMessage;
  unreadCount: number;
  updatedAt: number;
}

export interface EmergencyQuickMessagePreset {
  id: string;
  icon: string;
  label: string;
  text: string;
  priority: MessagePriority;
}

export const EMERGENCY_QUICK_PRESETS: EmergencyQuickMessagePreset[] = [
  {
    id: 'need-help',
    icon: '🆘',
    label: 'Need Help',
    text: '🆘 I need help. Please respond if you can assist.',
    priority: 'emergency',
  },
  {
    id: 'medical',
    icon: '🏥',
    label: 'Medical Emergency',
    text: '🏥 Medical Emergency: Need urgent first aid / medication assistance.',
    priority: 'emergency',
  },
  {
    id: 'water-rising',
    icon: '🌊',
    label: 'Water Level Rising',
    text: '🌊 Water Level Rising rapidly in this sector. Move to higher ground!',
    priority: 'emergency',
  },
  {
    id: 'road-blocked',
    icon: '🚧',
    label: 'Road Blocked',
    text: '🚧 Road Blocked / Inundated: This access route is completely submerged and impassable.',
    priority: 'normal',
  },
  {
    id: 'safe-shelter',
    icon: '🏠',
    label: 'Safe Shelter Here',
    text: '🏠 Safe Shelter Here: Multi-storey elevated dry zone available for sheltering.',
    priority: 'normal',
  },
  {
    id: 'people-trapped',
    icon: '👥',
    label: 'People Trapped',
    text: '👥 People Trapped: Elderly / children stranded and requiring rescue evacuation.',
    priority: 'emergency',
  },
  {
    id: 'danger-avoid',
    icon: '⚠️',
    label: 'Danger – Avoid This Area',
    text: '⚠️ Danger – Avoid This Area: Live electrical wire / open storm drain hazard detected.',
    priority: 'emergency',
  },
];

export interface BLETransportPacket {
  id: string;       // Message ID
  idx: number;      // Current chunk index (0-based)
  total: number;    // Total chunks
  data: string;     // Chunk segment
}

export interface DiagnosticCheckResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'pending';
  details: string;
  durationMs?: number;
}

export interface DiagnosticSummary {
  timestamp: number;
  overallHealthy: boolean;
  checks: DiagnosticCheckResult[];
  summary: string;
}

export interface ConnectionHealthMetrics {
  lastPingTime: number;
  lastPongTime: number;
  rttMs: number;
  missedPings: number;
  linkQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
}
