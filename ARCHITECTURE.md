# Arquitetura Offline-First - Registro de Viagem SH

## Visão Geral

Esta aplicação implementa uma arquitetura **offline-first**, onde o SQLite é a fonte de dados local principal e a sincronização com o servidor ocorre automaticamente quando há conexão ou manualmente via botão.

## Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────┐
│                      OFFLINE CONTEXT                         │
│  (Gerenciador Central de Dados e Sincronização)            │
└─────────────────┬───────────────────────────┬───────────────┘
                  │                           │
                  ▼                           ▼
        ┌──────────────────┐        ┌──────────────────┐
        │  SQLite Local    │        │  Supabase API    │
        │  (Fonte Primária)│◄──────►│  (Servidor)      │
        └──────────────────┘        └──────────────────┘
                  │                           
                  ▼                           
        ┌──────────────────┐                 
        │   UI Components  │                 
        │   (TripForm,     │                 
        │    Header, etc)  │                 
        └──────────────────┘                 
```

## Componentes Principais

### 1. OfflineContext (`src/contexts/OfflineContext.tsx`)

**Responsabilidades:**
- Gerenciar estado de conectividade (online/offline)
- Coordenar sincronização automática e manual
- Fornecer interface unificada para acesso aos dados
- Resolver conflitos de sincronização

**Estados Expostos:**
```typescript
{
  isOnline: boolean;        // Status da conexão
  isSyncing: boolean;       // Se está sincronizando
  lastSyncAt: Date | null;  // Última sincronização
  isReady: boolean;         // Se SQLite está pronto
}
```

**Métodos Expostos:**
```typescript
{
  getMotoristas(filtro?: string): Promise<OfflineEmployee[]>;
  getVeiculos(filtro?: string): Promise<OfflineVehicle[]>;
  getViagens(filtro?: any): Promise<OfflineTrip[]>;
  syncNow(): Promise<void>;
}
```

### 2. useSQLite Hook (`src/hooks/useSQLite.ts`)

**Responsabilidades:**
- Inicializar e gerenciar conexão SQLite
- Operações CRUD no banco local
- Manter esquema de tabelas sincronizado

**Tabelas:**

#### `offline_trips`
```sql
CREATE TABLE offline_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  km_inicial REAL NOT NULL,
  km_final REAL NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  start_latitude REAL,
  start_longitude REAL,
  end_latitude REAL,
  end_longitude REAL,
  duration_seconds INTEGER NOT NULL,
  origem TEXT,
  destino TEXT,
  motivo TEXT,
  observacao TEXT,
  status TEXT NOT NULL,
  employee_photo_base64 TEXT,
  trip_photos_base64 TEXT,
  synced INTEGER DEFAULT 0,        -- 0 = não sincronizado, 1 = sincronizado
  deleted INTEGER DEFAULT 0,       -- 0 = ativo, 1 = deletado (soft delete)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

#### `offline_employees`
```sql
CREATE TABLE offline_employees (
  id TEXT PRIMARY KEY,
  matricula TEXT NOT NULL,
  nome_completo TEXT NOT NULL,
  cargo TEXT NOT NULL
);
```

#### `offline_vehicles`
```sql
CREATE TABLE offline_vehicles (
  id TEXT PRIMARY KEY,
  placa TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL
);
```

### 3. SearchableCombobox (`src/components/ui/searchable-combobox.tsx`)

**Responsabilidades:**
- Input com busca incremental (typeahead)
- Não mostrar lista automaticamente ao focar
- Filtrar resultados conforme digitação (após 2+ caracteres)
- Limitar resultados para performance (20 items)

**Características:**
- **Debouncing**: Filtros aplicados em tempo real
- **Performance**: Limite de resultados e renderização otimizada
- **UX**: Cursor visível, lista leve, não polui tela

## Sincronização

### Sincronização Automática

1. **Ao Detectar Conexão:**
   - `Network.addListener` detecta mudança de status
   - Se volta online, dispara `syncNow()` automaticamente

2. **Ao Inicializar App:**
   - Se está online e plataforma nativa, sincroniza ao carregar

### Sincronização Manual

**Botão no Menu Hamburguer:**
- Localizado no Header (menu lateral)
- Mostra status atual (online/offline)
- Exibe última sincronização
- Desabilitado se offline ou já sincronizando
- Feedback visual durante processo

### Fluxo de Sincronização

```
syncNow()
  │
  ├─► 1. syncMasterData() 
  │     ├─ Fetch employees from Supabase
  │     ├─ Save to SQLite (offline_employees)
  │     ├─ Fetch vehicles from Supabase
  │     └─ Save to SQLite (offline_vehicles)
  │
  └─► 2. syncTripsToServer()
        ├─ Get unsynced trips (synced = 0)
        ├─ For each trip:
        │   ├─ Upload employee photo (base64 → storage)
        │   ├─ Upload trip photos (base64 → storage)
        │   ├─ Create trip record in Supabase
        │   └─ Mark as synced (synced = 1)
        └─ Show success/error feedback
```

### Estratégia de Resolução de Conflitos

**Dados Mestres (Employees, Vehicles):**
- **Servidor é fonte da verdade**
- Sempre sobrescreve dados locais na sincronização
- Não há edição local destes dados

**Viagens (Trips):**
- **Local é fonte da verdade para criação**
- Viagens criadas offline são **sempre enviadas** ao servidor
- Não há edição de viagens após criação (apenas criação)
- Soft delete local (deleted = 1) para futuras implementações

**Conflitos Possíveis:**
1. **Viagem criada offline com employee/vehicle deletado no servidor**
   - Sincronização falha com erro
   - Viagem permanece local (synced = 0)
   - Usuário notificado para corrigir

2. **Múltiplas tentativas de sincronização**
   - Apenas viagens com synced = 0 são enviadas
   - Após sucesso, marcadas como synced = 1
   - Evita duplicação de dados

## Exemplo de Uso nos Componentes

### TripForm.tsx

```typescript
// Usar o contexto offline
const { isOnline, isSyncing, getMotoristas, getVeiculos } = useOfflineData();

// Carregar dados
useEffect(() => {
  const loadData = async () => {
    const emps = await getMotoristas();
    const vehs = await getVeiculos();
    setEmployees(emps);
    setVehicles(vehs);
  };
  loadData();
}, [getMotoristas, getVeiculos]);

// Input com busca incremental
<SearchableCombobox
  options={employees.map((emp) => ({
    value: emp.id,
    label: `${emp.nome_completo} (${emp.matricula})`,
    searchText: `${emp.nome_completo} ${emp.matricula} ${emp.cargo}`,
  }))}
  value={tripData.employeeId}
  onChange={(value) => setTripData(prev => ({ ...prev, employeeId: value }))}
  placeholder="Digite nome ou matrícula..."
  minCharsToSearch={2}
/>
```

### Header.tsx

```typescript
// Usar contexto para sincronização manual
const { syncNow, isSyncing, isOnline, lastSyncAt } = useOfflineData();

const handleSync = () => {
  syncNow(); // Dispara sincronização manual
};

<Button onClick={handleSync} disabled={isSyncing || !isOnline}>
  {isSyncing ? "Sincronizando..." : "Sincronizar Agora"}
</Button>
```

## Performance e Otimizações

### SQLite
- Queries simples e diretas
- Índices não necessários para volume atual
- Limpeza periódica de dados sincronizados (futuro)

### SearchableCombobox
- **Limit de 20 resultados** por busca
- **minCharsToSearch = 2** (evita buscas desnecessárias)
- **Debouncing nativo** do React (sem lib externa)
- **ScrollArea** para listas grandes

### Sincronização
- Sincroniza apenas trips com `synced = 0`
- Upload de fotos em sequência (não paralelo) para evitar sobrecarga
- Toast notifications para feedback visual

## Testes e Debug

### Logs Importantes

```typescript
// OfflineContext
console.log("Syncing master data from server...");
console.log(`Synced ${employees.length} employees to SQLite`);
console.log(`Syncing ${unsyncedTrips.length} trips to server...`);

// useSQLite
console.log("SQLite database initialized");
console.log("Trip saved to local database");
console.log(`Trip ${id} marked as synced`);
```

### Testando Offline

1. **Emulador/Dispositivo:**
   - Ativar modo avião
   - Verificar banner "Modo Offline"
   - Criar viagem
   - Verificar salvamento local
   - Desativar modo avião
   - Aguardar sincronização automática

2. **Web (apenas teste de UI):**
   - Abrir DevTools > Network
   - Ativar "Offline"
   - Testar componentes (SQLite não funciona)

## Limitações Conhecidas

1. **SQLite apenas em plataformas nativas**
   - Web não suporta SQLite
   - Context funciona mas não salva dados

2. **Sem edição de viagens**
   - Apenas criação implementada
   - Futuro: edição com resolução de conflitos

3. **Fotos grandes**
   - Base64 aumenta tamanho em ~33%
   - Futuro: compressão antes de salvar

4. **Sem paginação de histórico**
   - Todas as viagens carregadas de uma vez
   - Futuro: paginação server-side

## Próximos Passos

1. Implementar limpeza periódica de trips sincronizados
2. Adicionar compressão de imagens
3. Implementar edição de viagens com resolução de conflitos
4. Adicionar sincronização em background (background tasks)
5. Implementar cache de imagens para não baixar novamente
