// WORK//ROOM catalogue override.
// Replaces the original 250-row /jobs route with a paginated fresh-first catalogue
// while preserving the existing Swiss visual view and filters.

const express = require('express');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) return;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false,
  max: 3,
});
const q=(text,params=[])=>pool.query(text,params);
const clean=(v='',max=200)=>String(v||'').trim().slice(0,max);

async function catalogueHandler(req,res,next){
  try{
    const params=[];
    const where=[
      'is_active=TRUE',
      '(expires_at IS NULL OR expires_at>NOW())',
      "COALESCE(published_at,created_at)>=NOW()-INTERVAL '90 days'",
    ];
    const add=(sql,value)=>{params.push(value);where.push(sql.replace('?',`$${params.length}`));};
    const query=clean(req.query.q,100);
    if(query){
      const val=`%${query}%`;
      params.push(val,val,val,val,val,val,val,val);
      const n=params.length;
      where.push(`(title ILIKE $${n-7} OR company ILIKE $${n-6} OR COALESCE(summary_ru,summary,'') ILIKE $${n-5} OR COALESCE(sector,'') ILIKE $${n-4} OR COALESCE(location,'') ILIKE $${n-3} OR COALESCE(experience,'') ILIKE $${n-2} OR COALESCE(work_mode,'') ILIKE $${n-1} OR COALESCE(employment_type,'') ILIKE $${n})`);
    }
    if(clean(req.query.sector,100))add('sector ILIKE ?',`%${clean(req.query.sector,100)}%`);
    if(clean(req.query.mode,80))add('work_mode ILIKE ?',`%${clean(req.query.mode,80)}%`);
    if(clean(req.query.experience,80))add('experience = ?',clean(req.query.experience,80));
    if(clean(req.query.location,100)){
      const value=`%${clean(req.query.location,100)}%`;
      params.push(value,value);
      const n=params.length;
      where.push(`(COALESCE(location,'') ILIKE $${n-1} OR COALESCE(country,'') ILIKE $${n})`);
    }
    if(req.query.salary==='1')where.push("COALESCE(salary,'')<>''");

    const countSql=`SELECT COUNT(*)::int AS c FROM jobs WHERE ${where.join(' AND ')}`;
    const totalCount=(await q(countSql,params)).rows[0].c;
    const perPage=Math.max(60,Math.min(160,Number(process.env.JOBS_PER_PAGE||120)));
    const pageCount=Math.max(1,Math.ceil(totalCount/perPage));
    const page=Math.max(1,Math.min(pageCount,Number(req.query.page||1)||1));
    const offset=(page-1)*perPage;
    const queryParams=[...params,perPage,offset];
    let jobs=(await q(`
      SELECT * FROM jobs
      WHERE ${where.join(' AND ')}
      ORDER BY featured DESC,
        COALESCE(published_at,created_at) DESC,
        created_at DESC
      LIMIT $${queryParams.length-1} OFFSET $${queryParams.length}
    `,queryParams)).rows;

    if(req.user&&jobs.length){
      const ids=jobs.map(j=>Number(j.id));
      const {rows}=await q('SELECT job_id,status FROM applications WHERE user_id=$1 AND job_id=ANY($2::bigint[])',[req.user.id,ids]);
      const statuses=new Map(rows.map(r=>[String(r.job_id),r.status]));
      jobs=jobs.map(j=>({...j,application_status:statuses.get(String(j.id))||null}));
    }

    const freshBase="is_active=TRUE AND COALESCE(published_at,created_at)>=NOW()-INTERVAL '90 days'";
    const sectors=(await q(`SELECT DISTINCT sector FROM jobs WHERE ${freshBase} AND COALESCE(sector,'')<>'' ORDER BY sector LIMIT 120`)).rows.map(r=>r.sector);
    const modeRows=(await q(`SELECT work_mode,COUNT(*)::int AS c FROM jobs WHERE ${freshBase} AND work_mode IN ('Remote','Hybrid','Office') GROUP BY work_mode`)).rows;
    const modeCounts=Object.fromEntries(modeRows.map(r=>[r.work_mode,r.c]));
    res.render('jobs/list',{title:'Вакансии',jobs,sectors,modeCounts,filters:req.query,totalCount,page,pageCount,perPage});
  }catch(err){next(err);}
}

const originalGet=express.application.get;
express.application.get=function workroomCatalogueGet(path,...handlers){
  if(path==='/jobs'&&!this.__workroomCatalogueRoute){
    Object.defineProperty(this,'__workroomCatalogueRoute',{value:true});
    return originalGet.call(this,path,catalogueHandler);
  }
  return originalGet.call(this,path,...handlers);
};

process.on('exit',()=>pool.end().catch(()=>{}));
