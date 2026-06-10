---
source: zerodha
title: Kite Connect — Instruments Master
url: https://kite.trade/docs/connect/v3/market-quotes/#instruments
---

# Instruments Master Dump

`GET /instruments` returns the complete list of tradable instruments across all
exchanges as a single CSV dump. Because this list is large (hundreds of thousands of
rows) and changes at most once per day, you should download it once daily and cache it
locally rather than calling it repeatedly.

## CSV columns

Each row includes `instrument_token` (the numeric id used for streaming and historical
data), `exchange_token`, `tradingsymbol`, `name`, `last_price`, `expiry`, `strike`,
`tick_size`, `lot_size`, `instrument_type` (EQ, FUT, CE, PE, etc.), `segment`, and
`exchange`.

## Per-exchange dumps

`GET /instruments/:exchange` returns the instruments for a single exchange (for
example NSE or NFO), which is smaller and faster to download when you only trade one
segment.

## Resolving symbols to tokens

Streaming (WebSocket) and historical-data endpoints are keyed by `instrument_token`,
so the typical workflow is: download the instruments dump, build a map from
`exchange:tradingsymbol` to `instrument_token`, and use that map to translate symbols
before subscribing or requesting candles.
