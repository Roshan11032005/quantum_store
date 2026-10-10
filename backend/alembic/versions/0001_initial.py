"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-02
"""

from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("username", sa.String(length=128), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=False)

    op.create_table(
        "user_keys",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("key_type", sa.Enum("kem", "sig", name="keytype"), nullable=False),
        sa.Column("algorithm", sa.String(length=128), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("public_key_sha256", sa.String(length=64), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "files",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("owner_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False, unique=True),
        sa.Column("metadata_json", sa.Text(), nullable=False),
        sa.Column("kem_ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("wrapped_dek", sa.LargeBinary(), nullable=False),
        sa.Column("signature", sa.LargeBinary(), nullable=False),
        sa.Column("sig_key_id", sa.String(length=36), sa.ForeignKey("user_keys.id"), nullable=False),
        sa.Column("ciphertext_size", sa.Integer(), nullable=False),
        sa.Column("ciphertext_sha256", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "auth_challenges",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("username_hint", sa.String(length=128), nullable=False),
        sa.Column("nonce", sa.LargeBinary(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False),
    )

    op.create_table(
        "benchmark_runs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("created_by", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("environment", sa.JSON(), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "benchmark_results",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("run_id", sa.String(length=36), sa.ForeignKey("benchmark_runs.id"), nullable=False),
        sa.Column("operation", sa.String(length=64), nullable=False),
        sa.Column("algorithm", sa.String(length=128), nullable=False),
        sa.Column("input_size_bytes", sa.Integer(), nullable=True),
        sa.Column("iterations", sa.Integer(), nullable=False),
        sa.Column("mean_ms", sa.Float(), nullable=False),
        sa.Column("median_ms", sa.Float(), nullable=False),
        sa.Column("stdev_ms", sa.Float(), nullable=False),
        sa.Column("p95_ms", sa.Float(), nullable=False),
        sa.Column("min_ms", sa.Float(), nullable=False),
        sa.Column("max_ms", sa.Float(), nullable=False),
        sa.Column("public_key_bytes", sa.Integer(), nullable=True),
        sa.Column("secret_key_bytes", sa.Integer(), nullable=True),
        sa.Column("ciphertext_or_signature_bytes", sa.Integer(), nullable=True),
    )

    op.create_table(
        "audit_log",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("file_id", sa.String(length=36), nullable=True),
        sa.Column("ip", sa.String(length=128), nullable=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("benchmark_results")
    op.drop_table("benchmark_runs")
    op.drop_table("auth_challenges")
    op.drop_table("files")
    op.drop_table("user_keys")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS keytype")
