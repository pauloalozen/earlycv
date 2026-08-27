import type { ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";

// GoogleStrategy é configurada com `state: false` (sem session store — a
// API é stateless/JWT, sem express-session). Isso NÃO impede passar um
// `state` explícito por request: passport-oauth2, quando `options.state` é
// uma string, grava `params.state` direto na URL de autorização e ignora o
// _stateStore por completo (node_modules/passport-oauth2/lib/strategy.js,
// branch `if (state && typeof state == 'string')`). O Google devolve esse
// mesmo valor no callback via req.query.state, sem precisar de sessão em
// nenhuma ponta. Esse guard só existe pra injetar esse valor por request —
// `state` é opcional aqui: nem toda ida a /auth/google/start nasce de uma
// análise guest pendente.
@Injectable()
export class GoogleOAuthStartGuard extends AuthGuard("google") {
  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const state = request.query.state;

    return typeof state === "string" && state.length > 0 ? { state } : {};
  }
}
