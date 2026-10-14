import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "data", "events.json");
const manualPath = path.join(root, "data", "manual-events.json");
const userAgent = "MES-Companion-Web/1.0 (+https://github.com/stock2lab/mes-companion-web)";
const sourceStatus = [];

const rules = [
  [/consumer price index/i, "CPI", "消费者价格指数 CPI", "critical"],
  [/employment situation/i, "Employment Situation", "非农就业报告", "critical"],
  [/producer price index/i, "PPI", "生产者价格指数 PPI", "high"],
  [/job openings and labor turnover/i, "JOLTS", "JOLTS 职位空缺", "high"],
  [/employment cost index/i, "Employment Cost Index", "就业成本指数 ECI", "high"],
  [/productivity and costs/i, "Productivity and Costs", "生产率与成本", "medium"],
  [/import and export price/i, "Import/Export Prices", "进出口价格指数", "medium"],
  [/gross domestic product|\bgdp\b/i, "GDP", "国内生产总值 GDP", "critical"],
  [/personal income and outlays/i, "Personal Income & Outlays", "个人收入与支出 / PCE", "critical"],
  [/international trade in goods and services/i, "International Trade", "国际贸易", "medium"]
];

function decodeHtml(value) {
  return value.replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&#039;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&ndash;/gi,"–").replace(/&mdash;/gi,"—").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
}
function classify(title) {
  for (const [pattern, shortTitle, titleZh, impact] of rules) if (pattern.test(title)) return { shortTitle, titleZh, impact };
  return null;
}
function unfoldIcs(text) { return text.replace(/\r?\n[ \t]/g, ""); }
function easternOffset(date, time) {
  const [year,month,day]=date.split("-").map(Number); const [hour,minute]=time.split(":").map(Number);
  const probe=new Date(Date.UTC(year,month-1,day,hour,minute));
  const value=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",timeZoneName:"longOffset"}).formatToParts(probe).find(p=>p.type==="timeZoneName")?.value||"GMT-05:00";
  return value.replace("GMT","");
}
function isoEastern(date, time) { return `${date}T${time}:00${easternOffset(date,time)}`; }
function parseIcsDate(raw) {
  const match=raw.match(/(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/); if(!match)return null;
  return {date:`${match[1]}-${match[2]}-${match[3]}`,time:match[4]?`${match[4]}:${match[5]||"00"}`:"08:30"};
}
async function fetchText(url) {
  const response=await fetch(url,{headers:{"User-Agent":userAgent,"Accept":"text/html,text/calendar,application/xml;q=0.9,*/*;q=0.8"}});
  if(!response.ok)throw new Error(`${response.status} ${response.statusText}`); return response.text();
}
async function fetchBls() {
  const url="https://www.bls.gov/schedule/news_release/bls.ics"; const text=unfoldIcs(await fetchText(url)); const events=[];
  for(const block of text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)||[]){
    const summary=(block.match(/^SUMMARY[^:]*:(.+)$/m)?.[1]||"").replace(/\\,/g,",").trim(); const rule=classify(summary); if(!rule)continue;
    const rawDate=block.match(/^DTSTART[^:]*:(.+)$/m)?.[1]||""; const parsed=parseIcsDate(rawDate); if(!parsed)continue;
    events.push({startsAt:isoEastern(parsed.date,parsed.time),title:rule.shortTitle,titleZh:rule.titleZh,impact:rule.impact,source:"BLS",url:"https://www.bls.gov/schedule/"});
  }
  sourceStatus.push({name:"BLS",status:"ok",count:events.length,url}); return events;
}
function inferYear(month, day) {
  const now=new Date(); const currentYear=now.getUTCFullYear(),currentMonth=now.getUTCMonth()+1; return month+1<currentMonth?currentYear+1:currentYear;
}
async function fetchBea() {
  const url="https://www.bea.gov/news/schedule"; const html=await fetchText(url); const months={January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12}; const events=[];
  for(const row of html.match(/<tr\b[\s\S]*?<\/tr>/gi)||[]){
    const text=decodeHtml(row); const match=text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{1,2}:\d{2})\s*(AM|PM)\b/i); if(!match)continue;
    const rule=classify(text); if(!rule)continue; const month=months[match[1][0].toUpperCase()+match[1].slice(1).toLowerCase()],day=+match[2],year=inferYear(month,day); let [hour,minute]=match[3].split(":").map(Number); if(match[4].toUpperCase()==="PM"&&hour!==12)hour+=12;if(match[4].toUpperCase()==="AM"&&hour===12)hour=0;
    const date=`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`,time=`${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
    events.push({startsAt:isoEastern(date,time),title:rule.shortTitle,titleZh:rule.titleZh,impact:rule.impact,source:"BEA",url});
  }
  sourceStatus.push({name:"BEA",status:"ok",count:events.length,url}); return events;
}
function normalize(event) { return {...event,id:`${event.startsAt}|${event.title}|${event.source}`.toLowerCase().replace(/[^a-z0-9|:-]+/g,"-")}; }
function uniqueSorted(events) { const seen=new Set();return events.map(normalize).filter(e=>{if(seen.has(e.id))return false;seen.add(e.id);return true}).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)); }

const manual=JSON.parse(await readFile(manualPath,"utf8")); let existing={events:[]};try{existing=JSON.parse(await readFile(outputPath,"utf8"))}catch{}
const collected=[];
for(const [name,loader,url] of [["BLS",fetchBls,"https://www.bls.gov/schedule/news_release/bls.ics"],["BEA",fetchBea,"https://www.bea.gov/news/schedule"]]){
  try{collected.push(...await loader())}catch(error){console.warn(`${name} fetch failed: ${error.message}`);sourceStatus.push({name,status:"error",url,error:error.message});collected.push(...existing.events.filter(e=>e.source===name))}
}
const manualGroups=new Map();
for(const event of manual)manualGroups.set(event.source,[...(manualGroups.get(event.source)||[]),event]);
for(const [name,events] of manualGroups)sourceStatus.push({name,status:"manual-fallback",count:events.length,url:events[0]?.url});
const cutoff=Date.now()-35*86400000,horizon=Date.now()+400*86400000; const events=uniqueSorted([...collected,...manual]).filter(e=>{const t=Date.parse(e.startsAt);return t>=cutoff&&t<=horizon});
if(!events.length)throw new Error("No events available; refusing to replace the existing feed");
await writeFile(outputPath,JSON.stringify({schemaVersion:1,checkedAt:new Date().toISOString(),timeZone:"America/New_York",sources:sourceStatus,events},null,2)+"\n");
console.log(`Wrote ${events.length} events (${sourceStatus.map(s=>`${s.name}:${s.status}`).join(", ")})`);
