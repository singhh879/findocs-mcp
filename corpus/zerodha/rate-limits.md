---
source: zerodha
title: Kite Connect — Rate Limits and Postbacks
url: https://kite.trade/docs/connect/v3/exceptions/
---

# Rate Limits, Postbacks, and Error Handling

## API rate limits

Kite Connect enforces per-endpoint request rate limits. As a guide: the Quote
endpoints are limited to about 1 request per second, Historical candle data to about
3 requests per second, order placement to about 10 requests per second, and most other
endpoints to about 10 requests per second. Exceeding a limit returns HTTP 429 (Too
Many Requests); back off and retry.

## Order quantity and frequency caps

In addition to rate limits, there are daily caps on the number of orders and on order
modifications per order. Repeatedly modifying a single order beyond the allowed count
results in rejection.

## Postbacks (webhooks)

If you configure a postback URL for your app, Kite sends a signed JSON POST to that URL
whenever an order's status changes. The payload includes a `checksum` so you can verify
authenticity using your `api_secret`. Postbacks are the recommended way to track order
state without polling.

## Error responses

Errors are returned as JSON with an `error_type` and a human-readable `message`. Common
types include `TokenException` (invalid or expired session), `InputException` (bad
parameters), `OrderException` (order could not be placed), and `NetworkException`
(downstream/exchange issues).
