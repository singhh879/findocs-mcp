---
source: zerodha
title: Kite Connect — Historical Candle Data
url: https://kite.trade/docs/connect/v3/historical/
---

# Historical Candle Data

`GET /instruments/historical/:instrument_token/:interval` returns historical OHLCV
candles for an instrument over a date range supplied via the `from` and `to` query
parameters (formatted `yyyy-mm-dd hh:mm:ss`). Historical data access requires the
historical data subscription on the app.

## Supported intervals

Supported `interval` values are `minute`, `3minute`, `5minute`, `10minute`,
`15minute`, `30minute`, `60minute`, and `day`. Each candle contains timestamp, open,
high, low, close, and volume.

## Per-request range limits

Each interval has a maximum date range per request. For example, `minute` data is
limited to roughly 60 days per request, `day` candles to about 2000 days, and the
intraday intervals fall in between. To fetch a longer span you must page through
multiple requests with successive date windows.

## Continuous and open interest data

For derivative instruments you can pass `continuous=1` to stitch together data across
contract expiries, and `oi=1` to include the open interest column alongside OHLCV.

## Instrument tokens

Historical requests are keyed by numeric `instrument_token`, not by trading symbol.
Resolve the token for a symbol from the instruments master dump before requesting
candles.
