'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const GQL = require('..')

const dogs = [{
  name: 'Max'
}, {
  name: 'Charlie'
}, {
  name: 'Buddy'
}, {
  name: 'Max'
}]

const owners = {
  Max: {
    name: 'Jennifer'
  },
  Charlie: {
    name: 'Sarah'
  },
  Buddy: {
    name: 'Tracy'
  }
}

const schema = `
  type Human {
    name: String!
  }

  type Dog {
    name: String!
    owner: Human
  }

  type Query {
    dogs: [Dog]
  }
`

const resolvers = {
  Query: {
    dogs (_, params, { reply }) {
      return dogs
    }
  }
}

const query = `{
  dogs {
    name,
    owner {
      name
    }
  }
}`

test('loaders create batching resolvers', async (t) => {
  const app = Fastify()

  const loaders = {
    Dog: {
      async owner (queries, { reply }) {
        // note that the second entry for max is cached
        t.deepEqual(queries, [{
          obj: {
            name: 'Max'
          },
          params: {}
        }, {
          obj: {
            name: 'Charlie'
          },
          params: {}
        }, {
          obj: {
            name: 'Buddy'
          },
          params: {}
        }])
        return queries.map(({ obj }) => owners[obj.name])
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.deepEqual(JSON.parse(res.body), {
    data: {
      dogs: [{
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }, {
        name: 'Charlie',
        owner: {
          name: 'Sarah'
        }
      }, {
        name: 'Buddy',
        owner: {
          name: 'Tracy'
        }
      }, {
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }]
    }
  })
})

test('disable cache for each loader', async (t) => {
  const app = Fastify()

  const loaders = {
    Dog: {
      owner: {
        async loader (queries, { reply }) {
          // note that the second entry for max is NOT cached
          t.deepEqual(queries, [{
            obj: {
              name: 'Max'
            },
            params: {}
          }, {
            obj: {
              name: 'Charlie'
            },
            params: {}
          }, {
            obj: {
              name: 'Buddy'
            },
            params: {}
          }, {
            obj: {
              name: 'Max'
            },
            params: {}
          }])
          return queries.map(({ obj }) => owners[obj.name])
        },
        opts: {
          cache: false
        }
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.deepEqual(JSON.parse(res.body), {
    data: {
      dogs: [{
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }, {
        name: 'Charlie',
        owner: {
          name: 'Sarah'
        }
      }, {
        name: 'Buddy',
        owner: {
          name: 'Tracy'
        }
      }, {
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }]
    }
  })
})

test('defineLoaders method, if factory exists', async (t) => {
  const app = Fastify()

  const loaders = {
    Dog: {
      async owner (queries, { reply }) {
        return queries.map(({ obj }) => owners[obj.name])
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers
  })
  app.register(async function (app) {
    app.graphql.defineLoaders(loaders)
    app.graphql.defineLoaders(loaders)
  })

  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.equal(res.statusCode, 200)
  t.deepEqual(JSON.parse(res.body), {
    data: {
      dogs: [{
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }, {
        name: 'Charlie',
        owner: {
          name: 'Sarah'
        }
      }, {
        name: 'Buddy',
        owner: {
          name: 'Tracy'
        }
      }, {
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }]
    }
  })
})

test('support context in loader', async (t) => {
  const app = Fastify()

  const resolvers = {
    Query: {
      dogs: (_, params, context) => {
        return dogs
      }
    }
  }

  const loaders = {
    Dog: {
      async owner (queries, context) {
        t.equal(context.app, app)
        return queries.map(({ obj }) => owners[obj.name])
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders
  })

  // needed so that graphql is defined
  await app.ready()

  const query = 'query { dogs { name owner { name } } }'
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    body: {
      query
    }
  })

  t.deepEqual(JSON.parse(res.body), {
    data: {
      dogs: [{
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }, {
        name: 'Charlie',
        owner: {
          name: 'Sarah'
        }
      }, {
        name: 'Buddy',
        owner: {
          name: 'Tracy'
        }
      }, {
        name: 'Max',
        owner: {
          name: 'Jennifer'
        }
      }]
    }
  })
})

test('rersolver unknown type', async t => {
  const app = Fastify()

  const resolvers = {
    test: 2
  }

  app.register(GQL, {
    resolvers
  })

  try {
    // needed so that graphql is defined
    await app.ready()
    app.graphql('query { test }')
  } catch (error) {
    t.equal(error.message, 'Cannot find type test')
  }
})

test('minJit is not a number, throw error', async t => {
  const app = Fastify()

  app.register(GQL, {
    jit: '0'
  })
  const typeError = new Error('the jit option must be a number')

  try {
    await app.ready()
  } catch (error) {
    t.deepEqual(error, typeError)
  }
})

test('options cache is type = number', async t => {
  const app = Fastify()

  app.register(GQL, {
    cache: 256,
    schema
  })

  await app.ready()
})

test('options cache is boolean', async t => {
  const app = Fastify()

  app.register(GQL, {
    cache: true,
    schema
  })

  try {
    await app.ready()
  } catch (error) {
    t.equal(error.message, 'Cache type is not supported')
  }
})

test('options cache is !number && !boolean', async t => {
  const app = Fastify()

  app.register(GQL, {
    cache: 'cache'
  })

  try {
    await app.ready()
  } catch (error) {
    t.equal(error.message, 'Cache type is not supported')
  }
})

test('options cache is false and lruErrors exists', async t => {
  const app = Fastify()

  app.register(GQL, {
    schema,
    cache: false
  })

  // needed so that graphql is defined
  await app.ready()

  try {
    await app.graphql('{ dogs { name { owner } } }')
  } catch (error) {
    t.equal(error.message, 'Bad Request')
    t.end()
  }
})

test('reply is empty, throw error', async (t) => {
  const app = Fastify()

  const resolvers = {
    Query: {
      dogs: () => dogs
    }
  }

  const loaders = {
    Dog: {
      async owner (queries) {
        return queries.map(({ obj }) => owners[obj.name])
      }
    }
  }

  app.register(GQL, {
    schema,
    resolvers,
    loaders
  })

  // needed so that graphql is defined
  await app.ready()

  try {
    await app.graphql(query)
  } catch (error) {
    t.equal(error.message, 'Internal Server Error')
    t.equal(error.errors.length, 4)
    t.equal(error.errors[0].message, 'loaders only work via reply.graphql()')
  }
})

test('throw when persistedQueries is empty but onlyPersisted is true', async t => {
  const app = Fastify()

  app.register(GQL, {
    onlyPersisted: true
  })

  t.rejects(app.ready(), 'onlyPersisted is true but there are no persistedQueries')
})
