call apoc.schema.assert({},{Agreement:['id'],User:['username'],Role:['name']},false);

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

UNWIND range(0,9) AS id CREATE (n:Agreement{id:id});
MATCH (n:Agreement) WHERE n.id <=4 SET n:EastAgreement,n.name = 'East '+n.id;
MATCH (n:Agreement) WHERE n.id >=5 SET n:WestAgreement,n.name = 'West '+n.id;

Create (e:User{username:"eastUser",name:"east",loginAllowed:true})
Create (w:User{username:"westUser",name:"west",loginAllowed:true})
Create (re:Role{name:"EastAgreement"})
Create (rw:Role{name:"WestAgreement"})
Create (e)-[:HAS_ROLE]->(re)
Create (w)-[:HAS_ROLE]->(rw);
