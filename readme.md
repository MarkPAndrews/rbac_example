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

Create (e:User{username:"eastUser",name:"east",loginAllowed:true})
Create (w:User{username:"westUser",name:"west",loginAllowed:true})
Create (re:Role{name:"EastAgreement"})
Create (rw:Role{name:"WestAgreement"})
Create (e)-[:HAS_ROLE]->(re)
Create (w)-[:HAS_ROLE]->(rw);
```

## The Magic
All of the magic of impersonation happens in the context of each request.  In `setup.js` the context is defined to pull the current user from JWT and use it to create an `executionContext`  That is all you need.  Neo4j switches to the impersonated user when executing the queries and enforcing RBAC.
```
export async function getContext(req,connection){
    const globalAuth = process.env.GLOBAL_AUTH||false;    
    ...
        jwt = await authPlugin.decode(authValue);
    ...
        user = jwt.sub;
    ...
    return {
        driver,
        req: request,
        executionContext: driver.session({ impersonatedUser: user }),
        userProfile: profile,
        label
    };
  }
```
Disclaimer:  The JWT implementation is a bit of a hack here.  Ideally we would be able to use the OOTB Auth Plugin to handle the JWT but that happens after the context method is called.  So it's a bit of a catch 22.  The Auth Plugin uses the request in the context to get the token, but we need to return the executionContext in the context as it's being created.
The work-around is to manually use the auth plugin inside the context function and also assign it as a plugin so that the context.auth gets set as well.  Return auth from the context method doesn't work because it gets overwritten if no plugin is assigned.

## Extra Credit
This project also shows how to use context variables to dynamically change the model.  In this case it's addin the regional label to `Agreement` based on the current user.  In this case `label` is derived from a role assigned in the graph.  It could come from a JWT claim. It depends on where you want to manage roles. 

```
    type Agreement @node(additionalLabels:["$context.label"]) {
        id: Int!
        name: String
    }

```

## Run it
Copy .env.sample to .env and update the parameters as required.
If you already have OKTA or something like it set up, great!  If not the easiest way to test is to use AWS Cognito to stans up a quick little user pool and application to create tokens for you.

```
npm install
npm run
```

Issue the following GraphQL commands at http://localhost:4000/graphql to see it work.  Add a header variable `USER` with `eastUser` or `westUser` to see different results
```
query{agreements {id name}}
mutation{createAgreements(input: [{id:10 name:"testing"}]) {agreements { id name }}}
```

## Unit Testing framework
This example also includes a unit testing framework using a Neo4j Test Container.  Data is loaded into an empty graph running in a docker container before each test.  There is a "mock" Auth Plugin that skips the validation steps for the JWT to facilitate testing without having to generate real JWTs.


```
npm run test
```