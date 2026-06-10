---
source: zerodha
title: Kite Connect — Market Quotes
url: https://kite.trade/docs/connect/v3/market-quotes/
---

# Market Quotes

Kite Connect offers three REST quote endpoints with different levels of detail. All of
them accept instruments in the form `exchange:tradingsymbol` (for example
`NSE:INFY`).

## Full quote

`GET /quote` returns the full market quote: last traded price, last traded quantity,
average price, volume, buy/sell quantity, OHLC, open interest (for derivatives), and
the full five-level market depth (top five bids and offers). You can request up to
500 instruments in a single call.

## OHLC quote

`GET /quote/ohlc` returns the open, high, low, close, and last traded price only. It is
lighter than the full quote and supports up to 1000 instruments per call.

## LTP quote

`GET /quote/ltp` returns just the last traded price for each instrument and supports up
to 1000 instruments per call. Use LTP when you only need the current price and want to
minimise payload size and rate-limit pressure.

## Market depth

The five-level market depth in the full quote shows the top five buy orders (bids) and
top five sell orders (offers), each with price, quantity, and the number of orders at
that level.
