# Server-Sent Events (SSE)

Real-time progress updates for long-running operations.

## Overview

The evolutionary algorithm can take several seconds to complete. SSE provides live progress updates to the frontend.

## Connection

### Endpoint

```http
GET /api/sse/evolution-progress/:sessionId
```

### Session ID

Generate a unique session ID before starting analysis:

```typescript
const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
```

### Connection Example

```typescript
const eventSource = new EventSource(
  `http://localhost:3000/api/sse/evolution-progress/${sessionId}`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Progress:', data);
};

eventSource.onerror = (error) => {
  console.error('SSE Error:', error);
  eventSource.close();
};
```

## Event Types

### `generation_complete`

Sent after each generation of the evolutionary algorithm.

```json
{
  "type": "generation_complete",
  "issueType": "n_plus_1_query",
  "issueTitle": "N+1 Query in fetchUsers",
  "generation": 3,
  "maxGenerations": 10,
  "bestFitness": 0.87,
  "avgFitness": 0.72,
  "bestSolution": {
    "code": "const users = await db.users.findMany({ include: { orders: true } });",
    "fitness": 0.87
  },
  "population": [
    { "fitness": 0.87, "generation": 3 },
    { "fitness": 0.82, "generation": 2 },
    { "fitness": 0.79, "generation": 3 }
  ]
}
```

### `solution_found`

Sent when a high-quality solution is discovered.

```json
{
  "type": "solution_found",
  "issueType": "n_plus_1_query",
  "issueTitle": "N+1 Query in fetchUsers",
  "solution": {
    "code": "...",
    "fitness": 0.95,
    "reasoning": "Batch query eliminates N database calls"
  }
}
```

### `evolution_complete`

Sent when evolution finishes for an issue.

```json
{
  "type": "evolution_complete",
  "issueType": "n_plus_1_query",
  "issueTitle": "N+1 Query in fetchUsers",
  "totalGenerations": 8,
  "finalBestFitness": 0.95,
  "solutionsGenerated": 5,
  "timeMs": 4523
}
```

### `analysis_complete`

Sent when the entire analysis is complete.

```json
{
  "type": "analysis_complete",
  "totalIssues": 5,
  "totalSolutions": 18,
  "totalTimeMs": 12450
}
```

### `error`

Sent when an error occurs.

```json
{
  "type": "error",
  "message": "Failed to parse code",
  "details": "Unexpected token at line 45"
}
```

## Frontend Integration

### Angular Service

```typescript
@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private eventSource: EventSource | null = null;
  private progressSubject = new Subject<EvolutionProgress>();
  
  public progress$ = this.progressSubject.asObservable();

  connectToEvolutionProgress(sessionId: string): void {
    this.disconnectFromEvolutionProgress();
    
    this.eventSource = new EventSource(
      `${environment.apiUrl}/sse/evolution-progress/${sessionId}`
    );
    
    this.eventSource.onmessage = (event) => {
      this.ngZone.run(() => {
        const data = JSON.parse(event.data);
        this.progressSubject.next(data);
      });
    };

    this.eventSource.onerror = () => {
      this.disconnectFromEvolutionProgress();
    };
  }

  disconnectFromEvolutionProgress(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
```

### Component Usage

```typescript
@Component({
  selector: 'app-evolution-progress',
  template: `
    <div *ngIf="progress$ | async as progress">
      <h3>{{ progress.issueTitle }}</h3>
      <progress 
        [value]="progress.generation" 
        [max]="progress.maxGenerations">
      </progress>
      <p>Generation {{ progress.generation }}/{{ progress.maxGenerations }}</p>
      <p>Best Fitness: {{ progress.bestFitness | percent }}</p>
    </div>
  `
})
export class EvolutionProgressComponent {
  progress$ = this.analysisService.progress$;
  
  constructor(private analysisService: AnalysisService) {}
}
```

## Backend Implementation

```typescript
// routes/sse.routes.ts
router.get('/evolution-progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Store connection for this session
  sseClients.set(sessionId, res);

  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(sessionId);
  });
});

// Emit progress from evolutionary engine
function emitProgress(sessionId: string, data: object): void {
  const client = sseClients.get(sessionId);
  if (client) {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}
```

## Connection Management

### Reconnection

The browser will automatically reconnect on connection loss. Include `Last-Event-ID` header support for resumption:

```typescript
eventSource.onopen = () => {
  console.log('SSE connected');
};

eventSource.onerror = (e) => {
  if (eventSource.readyState === EventSource.CONNECTING) {
    console.log('Reconnecting...');
  }
};
```

### Cleanup

Always close the connection when leaving the page:

```typescript
ngOnDestroy(): void {
  this.analysisService.disconnectFromEvolutionProgress();
}
```
