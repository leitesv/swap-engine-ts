export type IConfig = {
    solar: {
      master: {
        address: string,
        paymentId: string,
        keyStore: string
      },
      providers: [
        string
      ]
    },
    bsc: {
      provider_url: string,
      sxpswap: {
        address: string,
        abi: []
      },
      swipe_token: {
        address: string,
        abi: []
      }
    },
    eth: {
      provider_url: string,
      swipe_token: {
        address: string,
        abi: []
      },
      sxpswap: {
        address: string,
        abi: []
      }
    }
  }