/**
 * Configuracion de ambiente.
 *
 * La clave anonima de Supabase es publica por diseno: la proteccion real son las
 * politicas RLS definidas en supabase/schema.sql, no el secreto de esta cadena.
 * Aun asi, NUNCA se pone aqui la clave `service_role`, que sortea RLS por completo.
 */
export interface Environment {
  produccion: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Bucket de Storage para las fotografias. */
  bucketFotos: string;
  municipioPorDefecto: string;
  departamentoPorDefecto: string;
}

export const environment: Environment = {
  produccion: false,
  supabaseUrl: '',
  supabaseAnonKey: '',
  bucketFotos: 'fotos-casos',
  municipioPorDefecto: 'Sevilla',
  departamentoPorDefecto: 'Valle del Cauca'
};
