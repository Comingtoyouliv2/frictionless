# @frictionless/provider-sdk

The SDK will let a provider connect its own credit database to the direct-swap protocol.

Its first adapter interface will expose:

~~~
reserveCredit
commitSwap
releaseSwap
getSwapStatus
~~~

The provider owns persistence. The SDK only validates protocol messages, signs responses, and invokes the provider adapter.
