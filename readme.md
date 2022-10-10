# Neo4j Impersonation Example

## Setup

The following Cypher sets up RBAC in Neo4j.  In this example we will restrict what users a can see by regions

```
CREATE ROLE UserImpersonator;
GRANT IMPERSONATE (*) ON DBMS TO UserImpersonator;
GRANT ROLE UserImpersonator TO neo4j;

CREATE ROLE EastRegionUser;
CREATE ROLE WestRegionUser;

DENY TRAVERSE ON GRAPH neo4j NODES EastAgreement TO WestRegionUser;
DENY TRAVERSE ON GRAPH neo4j NODES WestAgreement TO EastRegionUser;

CREATE USER eastUser SET PASSWORD 'abc' CHANGE NOT REQUIRED;
GRANT ROLE publisher to eastUser;
GRANT ROLE EastRegionUser to eastUser;

CREATE USER westUser SET PASSWORD 'abc' CHANGE NOT REQUIRED;
GRANT ROLE publisher to westUser;
GRANT ROLE WestRegionUser to westUser;
```

Now create some dummy data
```
:USE neo4j
UNWIND range(0,9) AS id CREATE (n:Agreement{id:id});
MATCH (n:Agreement) WHERE n.id <=4 SET n:EastAgreement,n.name = 'East '+n.id;
MATCH (n:Agreement) WHERE n.id >=5 SET n:WestAgreement,n.name = 'West '+n.id;
```

## The Magic
All of the magic of impersonation happens in the context of each request.  In `index.js` the context is defined to pull the current user from the request header and use it to create an `executionContext`  That is all you need.  Neo4j switches to the impersonated user when executing the queries and enforcing RBAC.
```
context: ({ req, connection }) => {
            const label = req.headers.user==='eastUser' ?'EastAgreement':'WestAgreement';
            return { req, 
                executionContext: driver.session({ impersonatedUser: req.headers.user }),
                label };
        },
```
Disclaimer:  JWT should be used instead of raw headers (obviously).

## Extra Credit
This project also shows how to use context variables to dynamically change the model.  In this case it's addin the regional label to `Agreement` based on the current user.  In this case `label` is essentually hard coded in the context.  In could come from a JWT claim or a simple query to the graph.

```
    type Agreement @node(additionalLabels:["$context.label"]) {
        id: Int!
        name: String
    }

```