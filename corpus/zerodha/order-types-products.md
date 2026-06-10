---
source: zerodha
title: Kite Connect — Order Types, Products, and Validity
url: https://kite.trade/docs/connect/v3/orders/#order-types
---

# Order Types, Products, and Validity

## Order types

Kite Connect supports four order types. `MARKET` executes at the best available
price. `LIMIT` executes at a specified `price` or better. `SL` (stop-loss limit)
becomes a limit order once the `trigger_price` is hit. `SL-M` (stop-loss market)
becomes a market order once the `trigger_price` is hit.

## Product types

The `product` parameter determines how a position is treated. `CNC` (Cash and Carry)
is for delivery-based equity trades. `NRML` is for overnight carry-forward in F&O and
currency. `MIS` (Margin Intraday Squareoff) is for intraday positions that are
auto-squared-off before market close. `MTF` is the Margin Trade Facility product for
leveraged delivery in eligible equities.

## Validity

The `validity` parameter can be `DAY` (active until end of day), `IOC` (Immediate or
Cancel — any unfilled portion is cancelled instantly), or `TTL` (valid for a number
of minutes specified by `validity_ttl`). TTL validity is supported only for regular
orders.

## Disclosed quantity and iceberg orders

`disclosed_quantity` reveals only part of a large order to the market. For a more
structured approach, the `iceberg` variety splits a large order into a number of
equal legs (`iceberg_legs`, between 2 and 10) that are released sequentially.

## Cover orders

A cover order (`co` variety) is a market or limit order placed together with a
compulsory stop-loss `trigger_price`, providing built-in risk protection for
intraday trades.
