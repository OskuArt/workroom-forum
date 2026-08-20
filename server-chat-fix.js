module.exports = function patchChat(source){
  let s = source;

  const oldSelect = `SELECT m.*, u.*, cp.pinned,cp.muted,\n      (u.last_seen > NOW() - INTERVAL '120 seconds') AS online,`;
  const newSelect = `SELECT m.id AS match_id, m.mode AS match_mode, m.created_at AS match_created_at,\n      u.*, cp.pinned,cp.muted,\n      (u.last_seen > NOW() - INTERVAL '120 seconds') AS online,`;

  if (!s.includes(oldSelect)) {
    throw new Error('chat fix: matches SELECT anchor not found');
  }
  s = s.replace(oldSelect, newSelect);

  const oldMap = `matchId:r.id,mode:r.mode,person:publicProfile(r,mode),pinned:!!r.pinned,muted:!!r.muted,online:!!r.online,lastMessage:r.last_message||""`;
  const newMap = `matchId:r.match_id,mode:r.match_mode,person:publicProfile(r,mode),pinned:!!r.pinned,muted:!!r.muted,online:!!r.online,lastMessage:r.last_message||""`;

  if (!s.includes(oldMap)) {
    throw new Error('chat fix: matches response anchor not found');
  }
  s = s.replace(oldMap, newMap);

  return s;
};
