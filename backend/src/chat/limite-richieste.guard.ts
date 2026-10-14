import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limite di richieste per indirizzo IP. Su Vercel l'IP del visitatore arriva
 * nell'intestazione x-real-ip impostata dalla piattaforma; in locale si usa
 * l'IP della connessione.
 */
@Injectable()
export class LimiteRichiesteGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const ipVercel = req.headers?.['x-real-ip'];
    return typeof ipVercel === 'string' && ipVercel ? ipVercel : (req.ip ?? 'sconosciuto');
  }
}
