// Test/development adapter only. Uses real SQLite transactions, not a production D1 substitute.
import {DatabaseSync} from 'node:sqlite';
export class LocalD1 {
  constructor(path=':memory:'){this.db=new DatabaseSync(path);this.db.exec('PRAGMA foreign_keys=ON');}
  prepare(sql){return new LocalStatement(this,sql);}
  async batch(statements){this.db.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>s.execute());this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  close(){this.db.close();}
}
class LocalStatement {
  constructor(db,sql,args=[]){Object.assign(this,{db,sql,args});}
  bind(...args){return new LocalStatement(this.db,this.sql,args.map(x=>x instanceof ArrayBuffer?new Uint8Array(x):x));}
  execute(){const stmt=this.db.db.prepare(this.sql);let results=[],changes=0;if(stmt.columns().length){results=stmt.all(...this.args).map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Uint8Array?Array.from(v):v])));changes=Number(this.db.db.prepare('SELECT changes() n').get().n);}else changes=Number(stmt.run(...this.args).changes);return {success:true,results,meta:{changes}};}
  async first(column){const result=this.execute().results[0]||null;return column?result?.[column]??null:result;}
  async all(){return this.execute();}
  async run(){return this.execute();}
}
