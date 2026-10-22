/**
 * Rotas do portal do colaborador (/api/v1/collab/…): exigem sessão, mas não um
 * workspace — o acesso a cada projeto é verificado nos serviços.
 */
import { assertSameOrigin } from './context';
import { handleError } from './http';
import { getCollabUser, type CollabUser } from './services/collaborators';

type Params = Record<string, string>;

export function collabRoute<P extends Params = Params>(handler: (req: Request, user: CollabUser, params: P) => Promise<Response>) {
  return async (req: Request, segment: { params: Promise<P> }): Promise<Response> => {
    try {
      if (!req.headers.get('authorization')) assertSameOrigin(req);
      const user = await getCollabUser(req);
      return await handler(req, user, await segment.params);
    } catch (error) {
      return handleError(error);
    }
  };
}
