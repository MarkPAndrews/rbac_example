const { Neo4jGraphQL } = require("@neo4j/graphql");
const { ApolloServer, gql } = require("apollo-server");
const neo4j = require("neo4j-driver");

console.log('starting');
const typeDefs = gql`
    type Agreement @node(additionalLabels:["$context.label"]) {
        id: Int!
        name: String
    }
`;

const driver = neo4j.driver(
    "bolt://localhost:7687",
    neo4j.auth.basic("neo4j", "Neo4j123")
);

const neoSchema = new Neo4jGraphQL({ typeDefs, driver });

neoSchema.getSchema().then((schema) => {
    const server = new ApolloServer({
        schema,
        context: ({ req, connection }) => {
            const label = req.headers.user==='eastUser' ?'EastAgreement':'WestAgreement';
            return { req, 
                executionContext: driver.session({ impersonatedUser: req.headers.user }),
                label };
        },
    });
  
    server.listen().then(({ url }) => {
        console.log(`🚀 Server ready at ${url}`);
    });
  })