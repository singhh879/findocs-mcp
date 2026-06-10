---
source: finvasia
title: Finvasia Shoonya API — WebSocket Feed
url: https://www.shoonya.com/api-documentation
---

# Finvasia Shoonya API — WebSocket Feed

The Shoonya WebSocket provides live market data and order updates. After opening the
socket you must send a connect message containing the `uid`, `actid`, and the session
token (`susertoken`); the server replies with an acknowledgement before any data flows.

## Touchline and depth subscriptions

Subscribe to touchline updates with the `t` (touchline) message type, passing a list of
`exchange|token` scrip keys. Touchline ticks (`tk`/`tf`) carry last traded price, last
traded quantity, volume, and OHLC. For full market depth, subscribe with the `d` (depth)
message type, which adds the five best bid and offer levels.

## Order updates

Subscribe to order updates after connecting to receive a push message whenever one of
the user's orders changes state. This avoids polling the order book for fills and
rejections.

## Scrip tokens

Subscriptions are keyed by exchange and numeric token (for example `NSE|26000` for the
NIFTY index), not by trading symbol. Resolve symbols to tokens via the symbol master
or the `/SearchScrip` endpoint before subscribing.
