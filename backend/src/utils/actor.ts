import  { Request } from 'express';

export const actorDe = (req: Request) => req.header('x-actor') ?? 'cliente';
export const rolDe = (req: Request) => req.header('x-rol') ?? 'CLIENTE';