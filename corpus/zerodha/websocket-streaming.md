---
source: zerodha
title: Kite Connect — WebSocket Streaming (Ticker)
url: https://kite.trade/docs/connect/v3/websocket/
---

# WebSocket Streaming (KiteTicker)

The Kite streaming quotes feed is delivered over a WebSocket connection at
`wss://ws.kite.trade`, authenticated with the `api_key` and `access_token` as query
parameters. The feed pushes binary tick packets in near real time.

## Subscription modes

After connecting, send a JSON message to `subscribe` to a list of instrument tokens,
then set a mode for them. There are three modes: `ltp` (last traded price only),
`quote` (LTP plus OHLC and volume, without market depth), and `full` (everything,
including the five-level market depth and timestamps).

## Subscription limits

A single WebSocket connection can subscribe to up to 3000 instruments. Ticks arrive as
binary frames; each frame may pack multiple instrument quotes, which the client library
parses into structured tick objects.

## Order updates over WebSocket

Besides market data, the same socket delivers `order_update` messages as JSON whenever
one of the user's orders changes state, giving a push-based alternative to polling the
order book.

## Reconnection

Client libraries implement automatic reconnection with exponential backoff. On
reconnect you must re-subscribe to your instruments, because subscriptions are not
preserved across connections.
