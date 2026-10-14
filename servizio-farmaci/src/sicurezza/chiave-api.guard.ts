import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const INTESTAZIONE_CHIAVE = 'x-api-key';
const PUBBLICO = 'pubblico';

/** Rotte accessibili senza chiave (stato del servizio). */
export const Pubblico = () => SetMetadata(PUBBLICO, true);

/**
 * Richiede l'intestazione x-api-key uguale a CHIAVE_API. Se CHIAVE_API non è
 * impostata (sviluppo locale) il controllo è disattivato.
 */
@Injectable()
export class ChiaveApiGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly chiave: () => string,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const chiave = this.chiave();
    if (!chiave) return true;
    const pubblico = this.reflector.getAllAndOverride<boolean>(PUBBLICO, [context.getHandler(), context.getClass()]);
    if (pubblico) return true;
    const ricevuta = context.switchToHttp().getRequest<Request>().header(INTESTAZIONE_CHIAVE) ?? '';
    if (!uguali(ricevuta, chiave)) throw new UnauthorizedException('Chiave API mancante o non valida');
    return true;
  }
}

function uguali(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
