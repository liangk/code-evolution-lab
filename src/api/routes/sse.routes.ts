import { Router, Request, Response } from 'express';

const router = Router();

// Store active SSE connections
const sseConnections = new Map<string, Response>();

// SSE endpoint for evolution progress
router.get('/evolution-progress/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  // Store connection
  sseConnections.set(sessionId, res);

  // Handle client disconnect
  req.on('close', () => {
    sseConnections.delete(sessionId);
    console.log(`SSE connection closed for session: ${sessionId}`);
  });
});

// Function to send progress updates to a specific session
export function sendProgressUpdate(sessionId: string, data: any): void {
  const connection = sseConnections.get(sessionId);
  if (connection) {
    connection.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

// Function to close a session
export function closeSession(sessionId: string): void {
  const connection = sseConnections.get(sessionId);
  if (connection) {
    connection.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
    connection.end();
    sseConnections.delete(sessionId);
  }
}

export default router;
