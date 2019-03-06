function lazyLoader(factory) {
    let client;
    return () => {
        if (!client) client = factory();
        return client
    }
}

exports.lazyLoader = lazyLoader;
