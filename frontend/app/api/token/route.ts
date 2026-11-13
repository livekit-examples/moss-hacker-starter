import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  AccessToken,
  type AccessTokenOptions,
  RoomAgentDispatch,
  RoomConfiguration,
  type VideoGrant,
} from 'livekit-server-sdk';
import { randomUUID } from 'node:crypto';

type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

// NOTE: you are expected to define the following environment variables in `.env.local`:
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
// Agent dispatch name — must match the agent's registered name (`agent-py`). See `.env.local`.
const AGENT_NAME = process.env.AGENT_NAME;

// httpOnly cookie that persists a stable per-user id across visits. Stamped into the agent
// dispatch metadata as `{ "user_id": <uuid> }` so the agent can scope its Moss memory per user.
const USER_COOKIE = 'lk_moss_user';
const USER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// don't cache the results
export const revalidate = 0;

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'THIS API ROUTE IS INSECURE. DO NOT USE THIS ROUTE IN PRODUCTION WITHOUT AN AUTHENTICATION LAYER.'
    );
  }

  try {
    if (LIVEKIT_URL === undefined) {
      throw new Error('LIVEKIT_URL is not defined');
    }
    if (API_KEY === undefined) {
      throw new Error('LIVEKIT_API_KEY is not defined');
    }
    if (API_SECRET === undefined) {
      throw new Error('LIVEKIT_API_SECRET is not defined');
    }

    // Resolve a stable per-user id from the httpOnly cookie, minting one on first visit.
    const cookieStore = await cookies();
    let userId = cookieStore.get(USER_COOKIE)?.value;
    const isNewUser = !userId;
    if (!userId) {
      userId = randomUUID();
    }

    // Parse room config from request body.
    const body = await req.json();
    const roomConfig = body?.room_config
      ? RoomConfiguration.fromJson(body.room_config, { ignoreUnknownFields: true })
      : new RoomConfiguration();

    // Stamp `{ "user_id": <uuid> }` as the agent dispatch metadata. The agent reads this via
    // `ctx.job.metadata`. Ensure an agent dispatch entry exists (using AGENT_NAME for explicit
    // dispatch) and preserve any agent name already supplied by the client.
    if (roomConfig.agents.length === 0) {
      roomConfig.agents.push(new RoomAgentDispatch({ agentName: AGENT_NAME ?? '' }));
    }
    const dispatchMetadata = JSON.stringify({ user_id: userId });
    for (const agent of roomConfig.agents) {
      if (!agent.agentName && AGENT_NAME) {
        agent.agentName = AGENT_NAME;
      }
      agent.metadata = dispatchMetadata;
    }

    // Generate participant token
    const participantName = 'user';
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10_000)}`;
    const roomName = `voice_assistant_room_${Math.floor(Math.random() * 10_000)}`;

    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName },
      roomName,
      roomConfig
    );

    // Return connection details
    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantName,
      participantToken,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });
    const response = NextResponse.json(data, { headers });

    // Persist the per-user id for subsequent visits (only needs writing when freshly minted).
    if (isNewUser) {
      response.cookies.set(USER_COOKIE, userId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: (process.env.NODE_ENV as string) === 'production',
        path: '/',
        maxAge: USER_COOKIE_MAX_AGE,
      });
    }

    return response;
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  roomConfig: RoomConfiguration | undefined
): Promise<string> {
  const at = new AccessToken(API_KEY, API_SECRET, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  if (roomConfig) {
    at.roomConfig = roomConfig;
  }

  return at.toJwt();
}
