import { db } from './database.js';
import { type RowDataPacket } from 'mysql2/promise';
import { economyPool } from './economy-database.js';
import { GLOBAL_SCOPE_ID } from './global-scope.js';

const MIGRATION_ID = 'global-player-data-v1';

/** Consolidate data created by older server-scoped releases into one player account. */
export async function migratePlayerDataToGlobalScope(): Promise<void> {
  if (economyPool) {
    await economyPool.query(`CREATE TABLE IF NOT EXISTS bot_data_migrations (migration_id VARCHAR(64) PRIMARY KEY, applied_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [rows] = await economyPool.execute<RowDataPacket[]>('SELECT migration_id FROM bot_data_migrations WHERE migration_id=?', [MIGRATION_ID]);
    if (!rows.length) {
      const connection = await economyPool.getConnection();
      try {
      await connection.beginTransaction();
      const scope = GLOBAL_SCOPE_ID;
      await connection.execute(`INSERT INTO economy_accounts (guild_id,user_id,balance,bank_balance,last_daily_at,last_work_at,last_fish_at,last_rob_at,last_crime_at,last_bank_interest_at,bank_interest_remainder,rob_protected_until,premium_balance,created_at,updated_at)
        SELECT ?,user_id,SUM(balance),SUM(bank_balance),MAX(last_daily_at),MAX(last_work_at),MAX(last_fish_at),MAX(last_rob_at),MAX(last_crime_at),MAX(last_bank_interest_at),MAX(bank_interest_remainder),MAX(rob_protected_until),SUM(premium_balance),MIN(created_at),MAX(updated_at) FROM economy_accounts WHERE guild_id<>? GROUP BY user_id
        ON DUPLICATE KEY UPDATE balance=balance+VALUES(balance),bank_balance=bank_balance+VALUES(bank_balance),premium_balance=premium_balance+VALUES(premium_balance),last_daily_at=GREATEST(COALESCE(last_daily_at,0),COALESCE(VALUES(last_daily_at),0)),last_work_at=GREATEST(COALESCE(last_work_at,0),COALESCE(VALUES(last_work_at),0)),last_fish_at=GREATEST(COALESCE(last_fish_at,0),COALESCE(VALUES(last_fish_at),0)),last_rob_at=GREATEST(COALESCE(last_rob_at,0),COALESCE(VALUES(last_rob_at),0)),last_crime_at=GREATEST(COALESCE(last_crime_at,0),COALESCE(VALUES(last_crime_at),0)),last_bank_interest_at=GREATEST(COALESCE(last_bank_interest_at,0),COALESCE(VALUES(last_bank_interest_at),0)),bank_interest_remainder=GREATEST(bank_interest_remainder,VALUES(bank_interest_remainder)),rob_protected_until=GREATEST(COALESCE(rob_protected_until,0),COALESCE(VALUES(rob_protected_until),0)),updated_at=GREATEST(updated_at,VALUES(updated_at))`, [scope, scope]);
      await connection.execute('UPDATE economy_ledger SET guild_id=? WHERE guild_id<>?', [scope, scope]);
      await connection.execute('UPDATE economy_item_ledger SET guild_id=? WHERE guild_id<>?', [scope, scope]);
      await connection.execute('UPDATE admin_audit_log SET guild_id=? WHERE guild_id<>?', [scope, scope]);
      await connection.execute('UPDATE economy_games SET guild_id=? WHERE guild_id<>?', [scope, scope]);
      await connection.execute(`INSERT INTO economy_inventory (guild_id,user_id,item_id,quantity,acquired_at) SELECT ?,user_id,item_id,SUM(quantity),MIN(acquired_at) FROM economy_inventory WHERE guild_id<>? GROUP BY user_id,item_id ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=LEAST(acquired_at,VALUES(acquired_at))`, [scope, scope]);
      await connection.execute(`INSERT IGNORE INTO rpg_pets (guild_id,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,last_explore_at,equipment_json,expedition_effects_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at)
        SELECT ?,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,last_explore_at,equipment_json,expedition_effects_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at FROM rpg_pets WHERE guild_id<>? ORDER BY updated_at DESC`, [scope, scope]);
      await connection.execute(`INSERT INTO rpg_inventory (guild_id,user_id,item_id,quantity) SELECT ?,user_id,item_id,SUM(quantity) FROM rpg_inventory WHERE guild_id<>? GROUP BY user_id,item_id ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)`, [scope, scope]);
      await connection.execute(`INSERT INTO rpg_quests (guild_id,user_id,quest_date,quest_id,progress,claimed) SELECT ?,user_id,quest_date,quest_id,MAX(progress),MAX(claimed) FROM rpg_quests WHERE guild_id<>? GROUP BY user_id,quest_date,quest_id ON DUPLICATE KEY UPDATE progress=GREATEST(progress,VALUES(progress)),claimed=GREATEST(claimed,VALUES(claimed))`, [scope, scope]);
      await connection.execute('UPDATE rpg_expedition_logs SET guild_id=? WHERE guild_id<>?', [scope, scope]);
      await connection.execute('UPDATE rpg_pvp_matches SET guild_id=? WHERE guild_id<>?', [scope, scope]);
      await connection.execute(`INSERT INTO user_inventory (guild_id,user_id,item_id,quantity,acquired_at) SELECT ?,user_id,item_id,SUM(quantity),MIN(acquired_at) FROM user_inventory WHERE guild_id<>? GROUP BY user_id,item_id ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),acquired_at=LEAST(acquired_at,VALUES(acquired_at))`, [scope, scope]);
      await connection.execute('INSERT INTO bot_data_migrations(migration_id,applied_at) VALUES(?,?)', [MIGRATION_ID, Math.floor(Date.now() / 1000)]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
      } finally {
        connection.release();
      }
    }
  }

  db.exec('CREATE TABLE IF NOT EXISTS bot_data_migrations (migration_id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  if (db.prepare('SELECT 1 FROM bot_data_migrations WHERE migration_id=?').get(MIGRATION_ID)) return;
  const migrate = db.transaction(() => {
    const scope = GLOBAL_SCOPE_ID;
    db.prepare(`INSERT INTO economy_accounts (guild_id,user_id,balance,bank_balance,last_daily_at,last_work_at,last_fish_at,last_rob_at,last_crime_at,last_bank_interest_at,bank_interest_remainder,rob_protected_until,premium_balance,created_at,updated_at)
      SELECT ?,user_id,SUM(balance),SUM(bank_balance),MAX(last_daily_at),MAX(last_work_at),MAX(last_fish_at),MAX(last_rob_at),MAX(last_crime_at),MAX(last_bank_interest_at),MAX(bank_interest_remainder),MAX(rob_protected_until),SUM(premium_balance),MIN(created_at),MAX(updated_at) FROM economy_accounts WHERE guild_id<>? GROUP BY user_id
      ON CONFLICT(guild_id,user_id) DO UPDATE SET balance=balance+excluded.balance,bank_balance=bank_balance+excluded.bank_balance,premium_balance=premium_balance+excluded.premium_balance,last_daily_at=MAX(COALESCE(last_daily_at,0),COALESCE(excluded.last_daily_at,0)),last_work_at=MAX(COALESCE(last_work_at,0),COALESCE(excluded.last_work_at,0)),last_fish_at=MAX(COALESCE(last_fish_at,0),COALESCE(excluded.last_fish_at,0)),last_rob_at=MAX(COALESCE(last_rob_at,0),COALESCE(excluded.last_rob_at,0)),last_crime_at=MAX(COALESCE(last_crime_at,0),COALESCE(excluded.last_crime_at,0)),last_bank_interest_at=MAX(COALESCE(last_bank_interest_at,0),COALESCE(excluded.last_bank_interest_at,0)),bank_interest_remainder=MAX(bank_interest_remainder,excluded.bank_interest_remainder),rob_protected_until=MAX(COALESCE(rob_protected_until,0),COALESCE(excluded.rob_protected_until,0)),updated_at=MAX(updated_at,excluded.updated_at)`).run(scope, scope);
    for (const table of ['economy_ledger','economy_item_ledger','admin_audit_log','economy_games','rpg_expedition_logs','rpg_pvp_matches']) db.prepare(`UPDATE ${table} SET guild_id=? WHERE guild_id<>?`).run(scope, scope);
    db.prepare(`INSERT INTO economy_inventory (guild_id,user_id,item_id,quantity,acquired_at) SELECT ?,user_id,item_id,SUM(quantity),MIN(acquired_at) FROM economy_inventory WHERE guild_id<>? GROUP BY user_id,item_id ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity,acquired_at=MIN(acquired_at,excluded.acquired_at)`).run(scope, scope);
    db.prepare(`INSERT OR IGNORE INTO rpg_pets (guild_id,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,last_explore_at,equipment_json,expedition_effects_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at)
      SELECT ?,user_id,name,species,rarity,element,specialization,level,xp,strength,defense,agility,hp,max_hp,energy,max_energy,last_explore_at,equipment_json,expedition_effects_json,known_moves_json,equipped_moves_json,move_points,free_name_used,created_at,updated_at FROM rpg_pets WHERE guild_id<>? ORDER BY updated_at DESC`).run(scope, scope);
    db.prepare(`INSERT INTO rpg_inventory (guild_id,user_id,item_id,quantity) SELECT ?,user_id,item_id,SUM(quantity) FROM rpg_inventory WHERE guild_id<>? GROUP BY user_id,item_id ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity`).run(scope, scope);
    db.prepare(`INSERT INTO rpg_quests (guild_id,user_id,quest_date,quest_id,progress,claimed) SELECT ?,user_id,quest_date,quest_id,MAX(progress),MAX(claimed) FROM rpg_quests WHERE guild_id<>? GROUP BY user_id,quest_date,quest_id ON CONFLICT(guild_id,user_id,quest_date,quest_id) DO UPDATE SET progress=MAX(progress,excluded.progress),claimed=MAX(claimed,excluded.claimed)`).run(scope, scope);
    db.prepare(`INSERT INTO user_inventory (guild_id,user_id,item_id,quantity,acquired_at) SELECT ?,user_id,item_id,SUM(quantity),MIN(acquired_at) FROM user_inventory WHERE guild_id<>? GROUP BY user_id,item_id ON CONFLICT(guild_id,user_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity,acquired_at=MIN(acquired_at,excluded.acquired_at)`).run(scope, scope);
    db.prepare(`INSERT OR IGNORE INTO music_favorites (guild_id,user_id,track_uri,title,author,duration_ms,artwork_url,saved_at) SELECT ?,user_id,track_uri,MAX(title),MAX(author),MAX(duration_ms),MAX(artwork_url),MIN(saved_at) FROM music_favorites WHERE guild_id<>? GROUP BY user_id,track_uri`).run(scope, scope);
    db.prepare(`INSERT OR IGNORE INTO music_playlists (guild_id,user_id,name,normalized_name,created_at) SELECT ?,user_id,MAX(name),normalized_name,MIN(created_at) FROM music_playlists WHERE guild_id<>? GROUP BY user_id,normalized_name`).run(scope, scope);
    db.prepare(`INSERT OR IGNORE INTO music_playlist_tracks (playlist_id,track_uri,title,author,duration_ms,artwork_url,added_at) SELECT target.id,track.track_uri,track.title,track.author,track.duration_ms,track.artwork_url,track.added_at FROM music_playlist_tracks track JOIN music_playlists source ON source.id=track.playlist_id JOIN music_playlists target ON target.guild_id=? AND target.user_id=source.user_id AND target.normalized_name=source.normalized_name WHERE source.guild_id<>?`).run(scope, scope);
    db.prepare('UPDATE music_playlists SET guild_id=? WHERE guild_id<>? AND id NOT IN (SELECT canonical.id FROM (SELECT id,user_id,normalized_name FROM music_playlists WHERE guild_id=?) canonical WHERE canonical.user_id=music_playlists.user_id AND canonical.normalized_name=music_playlists.normalized_name)').run(scope, scope, scope);
    db.prepare('INSERT INTO bot_data_migrations(migration_id,applied_at) VALUES(?,?)').run(MIGRATION_ID, Math.floor(Date.now() / 1000));
  });
  migrate.immediate();
}
