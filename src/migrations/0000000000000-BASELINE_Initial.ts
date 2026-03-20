
import { MigrationInterface, QueryRunner }
from "typeorm";

export class Baseline0000000000000
implements MigrationInterface {

public async up(
queryRunner: QueryRunner
): Promise<void> {

await queryRunner.query(`

CREATE TABLE IF NOT EXISTS _migrations(

id SERIAL PRIMARY KEY,
timestamp bigint,
name varchar

);

`);

}

public async down(): Promise<void>{}

}
