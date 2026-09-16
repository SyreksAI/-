import { describe, expect, it } from 'vitest';
import {
  compareChatMessages,
  mergeChatMessages,
  normalizeChatMessage,
  upsertLiveMessage,
} from './chatMessage.js';

const CHAT = 'general';
const YDAY = '2026-09-08T10:00:00+00:00';
const YDAY_B = '2026-09-08T10:01:00+00:00';
const TODAY_A = '2026-09-11T10:00:00+00:00';
const TODAY_B = '2026-09-11T10:01:00+00:00';

const baseHistory = () =>
  mergeChatMessages([], [
    normalizeChatMessage({
      id: 1,
      chat_id: CHAT,
      user_id: 1,
      text: 'A1',
      timestamp: YDAY,
    }),
    normalizeChatMessage({
      id: 2,
      chat_id: CHAT,
      user_id: 2,
      text: 'B1',
      timestamp: YDAY_B,
    }),
  ]);

const idsInChat = (messages) =>
  messages.filter((m) => m.chatId === CHAT).map((m) => m.id);

describe('chat message ordering', () => {
  it('A then B then A again — strict chronological tail [1,2,3,4]', () => {
    let messages = baseHistory();

    messages = upsertLiveMessage(
      messages,
      normalizeChatMessage({
        id: 3,
        chat_id: CHAT,
        user_id: 1,
        text: 'A2',
        timestamp: TODAY_A,
      }),
    );
    messages = upsertLiveMessage(
      messages,
      normalizeChatMessage({
        id: 4,
        chat_id: CHAT,
        user_id: 2,
        text: 'B2',
        timestamp: TODAY_B,
      }),
    );
    messages = upsertLiveMessage(
      messages,
      normalizeChatMessage({
        id: 5,
        chat_id: CHAT,
        user_id: 1,
        text: 'A3',
        timestamp: '2026-09-11T10:02:00+00:00',
      }),
    );

    expect(idsInChat(messages)).toEqual([1, 2, 3, 4, 5]);
  });

  it('B live message stays after A even when A optimistic timestamp was inflated', () => {
    let messages = baseHistory();

    messages = upsertLiveMessage(messages, {
      id: 'pending-a2',
      chatId: CHAT,
      userId: 1,
      text: 'A2',
      timestamp: '2099-01-01T00:00:00.000Z',
    });
    messages = upsertLiveMessage(
      messages,
      normalizeChatMessage({
        id: 3,
        chat_id: CHAT,
        user_id: 1,
        text: 'A2',
        timestamp: TODAY_A,
      }),
    );
    messages = upsertLiveMessage(
      messages,
      normalizeChatMessage({
        id: 4,
        chat_id: CHAT,
        user_id: 2,
        text: 'B2',
        timestamp: TODAY_B,
      }),
    );

    expect(idsInChat(messages)).toEqual([1, 2, 3, 4]);
    expect(compareChatMessages(
      messages.find((m) => m.id === 3),
      messages.find((m) => m.id === 4),
    )).toBeLessThan(0);
  });

  it('replaces optimistic message when server echoes client_temp_id', () => {
    let messages = baseHistory();
    messages = upsertLiveMessage(messages, {
      id: 'pending-42',
      chatId: CHAT,
      userId: 2,
      text: 'photo',
      timestamp: TODAY_B,
      files: [{ id: 'local-1', _pending: true }],
      uploadState: 'uploading',
    });
    const pendingIndex = messages.findIndex((m) => m.id === 'pending-42');

    messages = upsertLiveMessage(
      messages,
      normalizeChatMessage({
        id: 4,
        chat_id: CHAT,
        user_id: 2,
        text: 'photo',
        timestamp: TODAY_B,
        attachments: [{ id: 'att-1', kind: 'image', original_name: 'pic.jpg' }],
        client_temp_id: 'pending-42',
      }),
    );

    expect(messages.findIndex((m) => m.id === 4)).toBe(pendingIndex);
    expect(messages.some((m) => m.id === 'pending-42')).toBe(false);
  });

  it('replaces optimistic message at the same slot by id', () => {
    let messages = baseHistory();
    messages = upsertLiveMessage(messages, {
      id: 'pending-99',
      chatId: CHAT,
      userId: 2,
      text: 'B2',
      timestamp: TODAY_B,
    });
    const pendingIndex = messages.findIndex((m) => m.id === 'pending-99');

    messages = upsertLiveMessage(
      messages,
      normalizeChatMessage({
        id: 4,
        chat_id: CHAT,
        user_id: 2,
        text: 'B2',
        timestamp: TODAY_B,
      }),
    );

    expect(messages.findIndex((m) => m.id === 4)).toBe(pendingIndex);
    expect(messages.some((m) => m.id === 'pending-99')).toBe(false);
  });
});
