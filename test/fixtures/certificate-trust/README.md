# Certificate trust fixtures

`compromised-cas.json` contains public certificate variants from the [eMudhra incident](https://github.com/galadran/we-have-a-problem.com), including the twelve blocked intermediate and ancestor keys and their cross-sign paths.

The registry CA, leaf and private key are test-only loopback fixtures. The two incident leaf chains use the same loopback key and exercise both compromised authentication paths; no intermediate private key is stored here. Tests require private-registry TLS to succeed and both incident chains to fail. Native Git controls require all three unfiltered chains to complete strict TLS and reach the mock HTTP server; leaf validity is checked explicitly, so expiry cannot make filtering regressions pass.

## Exclusive npm trust policy

`other-registry-ca.pem` and `other-registry-server.pem` provide a second test-only authority for the existing localhost server key. Its CA signing private key was discarded. Tests verify that global TLS trust in this authority does not widen npm's explicitly selected private-only CA policy.

The trusted/rejected CA fixtures retain OpenSSL AUX server-authentication directives. The trusted incident corpus wraps the public certificates from `compromised-cas.json` with `openssl x509 -trustout -addtrust serverAuth`; these directives must never bypass key filtering.
