// Type declarations for @vercel/node
declare module '@vercel/node' {
  import { IncomingMessage, ServerResponse } from 'http';
  
  export interface VercelRequest extends IncomingMessage {
    body?: any;
    query?: { [key: string]: string | string[] };
    cookies?: { [key: string]: string };
    headers: { [key: string]: string | string[] | undefined };
  }
  
  export interface VercelResponse extends ServerResponse {
    status(code: number): VercelResponse;
    send(body?: any): VercelResponse;
    json(body: any): VercelResponse;
    end(): VercelResponse;
  }
}

