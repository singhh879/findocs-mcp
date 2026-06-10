---
source: zerodha
title: Kite Connect — Authentication & Sessions
url: https://kite.trade/docs/connect/v3/user/
---

# Kite Connect Authentication and Sessions

Kite Connect uses an OAuth-like login flow. Each app is identified by an `api_key`
and a matching `api_secret` issued from the developer console.

## Login flow

To start a session, redirect the user to the Kite login endpoint with your API key:
`https://kite.zerodha.com/connect/login?v=3&api_key=xxx`. After the user logs in
and authorizes the app, Kite redirects back to your registered redirect URL with a
short-lived `request_token` appended as a query parameter.

## Generating the access token

Exchange the `request_token` for an `access_token` by POSTing to
`/session/token`. You must send a `checksum`, which is the SHA-256 hash of the
concatenated string `api_key + request_token + api_secret`. The response contains
the `access_token`, the `public_token`, and the user's profile.

## Using the access token

Authenticate every subsequent API request with the HTTP header
`Authorization: token api_key:access_token`. The access token is valid only for the
trading day; it expires at the start of the next day (around 6 AM IST), after which
the user must log in again to obtain a fresh token. There is no refresh token — a
new login is required each day.

## Logout / invalidating a session

Call `DELETE /session/token` with the `api_key` and `access_token` to invalidate
the current access token before its natural expiry.
