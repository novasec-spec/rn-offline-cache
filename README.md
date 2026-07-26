# rn-offline-cache

Offline-first cache + sync outbox for React Native, backed by AsyncStorage.

Reads cached data instantly, refreshes from your backend when online, and
queues local writes in a persistent outbox so they survive app restarts and
get sent in order once connectivity returns.

## Install

```bash
npm install rn-offline-cache @react-native-async-storage/async-storage
```

## Developing this package

The devDependencies pin React 18 for typechecking, but npm's auto peer-resolution
for `@react-native-async-storage/async-storage` tries to pull in the latest
`react-native` (which wants React 19), causing an ERESOLVE conflict. Since this
repo doesn't actually run react-native (it just typechecks against it), install
with:

```bash
npm install --legacy-peer-deps
npx tsup src/index.ts --format cjs,esm --dts
```

Consumers installing the published package are unaffected — this only matters
for building the package itself.

## Usage

```tsx
import { useOfflineCache } from 'rn-offline-cache';
import NetInfo from '@react-native-community/netinfo';
import { useNetInfo } from '@react-native-community/netinfo';

type Message = { id: string; text: string; pending?: boolean };
type SendMessagePayload = { id: string; text: string };

function useChatMessages(chatId: string) {
  const netInfo = useNetInfo();

  return useOfflineCache<Message[], SendMessagePayload>({
    key: `chat:${chatId}`,
    namespace: 'chat-messages',
    isOnline: netInfo.isConnected ?? true,

    fetchRemote: async () => {
      const res = await fetch(`https://your-api.com/chats/${chatId}/messages`);
      return res.json();
    },

    sendMutation: async (payload) => {
      await fetch(`https://your-api.com/chats/${chatId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    applyMutation: (current, payload) => [
      ...(current ?? []),
      { id: payload.id, text: payload.text, pending: true },
    ],
  });
}

function ChatScreen({ chatId }: { chatId: string }) {
  const { data, loading, pendingCount, mutate } = useChatMessages(chatId);

  const send = (text: string) =>
    mutate({ id: Date.now().toString(), text });

  // render data, show pendingCount as a "sending..." indicator, etc.
}
```

## API

### `useOfflineCache(options)`

| Option | Type | Description |
|---|---|---|
| `key` | `string` | Unique key for this cached value, e.g. `chat:${chatId}` |
| `namespace` | `string` | Groups related caches/outboxes, avoids key collisions |
| `fetchRemote` | `() => Promise<T>` | Fetches fresh data from your backend |
| `sendMutation` | `(m) => Promise<void>` | Sends a queued mutation to your backend |
| `applyMutation` | `(current, m) => T` | Applies a mutation to the local cached value optimistically |
| `isOnline` | `boolean` | Pass your own connectivity state (e.g. from NetInfo) |

Returns `{ data, loading, error, pendingCount, refresh, mutate, flushOutbox }`.

### `Outbox` / `KeyedStorage`

Lower-level building blocks if you want to roll your own hook instead of
using `useOfflineCache` directly.

## License

MIT

