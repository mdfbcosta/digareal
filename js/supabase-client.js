/**
 * supabase-client.js — DigaReal Cloud
 * Inicializa o cliente Supabase com as credenciais do projeto.
 */

const SUPABASE_URL = 'https://yjgvsvyfhxtrmukxvxqd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqZ3ZzdnlmaHh0cm11a3h2eHFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NjM4ODcsImV4cCI6MjA5NjUzOTg4N30.XMsXLFCuQnVwC8s9IoNw5AywER_PxDtat0R9yaUqsJ8';

// Criado via CDN do Supabase JS v2 (carregado no index.html antes deste arquivo)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('[DigaReal] Supabase client inicializado.');
