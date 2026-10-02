export type NavSection =
  | 'monitor-global'
  | 'carga-masiva'
  | 'centro-notificaciones'
  | 'generar-informes'
  | 'revision-anomalias';

export type StatusType = 'COMPLETO' | 'CRÍTICO' | 'PENDIENTE' | 'NO INICIADO' | 'INCOMPLETO';

export interface MesaDetail {
  id: string;
  mesaNumber: string;
  delegados: { p1: boolean; p2: boolean };
  transmision: {
    p1: boolean | 'pending';
    p2: boolean | 'pending' | 'rescaneo';
  };
  estado: StatusType;
  ultimaCarga: string;
  anomalia?: string;
  horaCierreLocal?: string;
}

export interface ConsulateRow {
  id: string;
  code: string;
  pais: string;
  zona: string;
  puesto: string;
  numMesas: number;
  horaCierreColombia: string;
  horaActualPais: string;
  tiempoDesdeCierre: string;
  delegadosProgress: string;
  delegadosPercent: number;
  transmisionProgress: string;
  transmisionPercent: number;
  estadoGlobal: StatusType;
  mesas: MesaDetail[];
}

export interface QueueFileItem {
  id: string;
  filename: string;
  size: string;
  ext: string;
  barcode: string;
  location: string;
  ocrStatus: 'RECONOCIDO' | 'MANUAL_REQUERIDA' | 'DUPLICADO' | 'RESUELVE_ALERTA' | 'NUEVO_REGISTRO';
  ocrConfidence?: number;
  details?: string;
}

export interface SlaRow {
  id: string;
  consulateName: string;
  pais: string;
  region: 'europa' | 'america' | 'asia';
  zona: string;
  puesto: string;
  mesasInactivas: string[];
  horaCierreLocal: string;
  tiempoTranscurridoMin: number;
  tiempoTranscurridoLabel: string;
  fase: 'fase1' | 'fase2' | 'fase3';
  faseLabel: string;
  subFaseDesc: string;
  notifChannel: 'WA' | 'SMS' | 'EMAIL';
  notifChannelExtra?: 'SMS' | 'WA';
  notifDespacho: string;
  notifEstado: string;
  notifEstadoColor: string;
  notifHasWarning?: boolean;
}

export interface AnomaliaItem {
  id: string;
  horaAlertaLocal: string;
  horaAlertaCol: string;
  pais: string;
  ciudad: string;
  mesa: string;
  formulario: string;
  tipoAnomalia: 'SIN_FIRMAS' | 'ILEGIBLE_RESCANEO' | 'CODIGO_NO_DETECTADO';
  tipoLabel: string;
  slaMinutesRemaining: number;
  slaDisplay: string;
  mesaIdRef: string;
}

export interface AuditEvent {
  time: string;
  title: string;
  desc: string;
  type: 'error' | 'warning' | 'info' | 'success';
}
