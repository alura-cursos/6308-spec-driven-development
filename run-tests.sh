#!/bin/sh
# Executa o ambiente de testes isolado (Jest + Newman/Postman)
# Uso: sh run-tests.sh

set -e

COMPOSE="docker compose -f docker-compose.test.yml"

cleanup() {
  echo ""
  echo "==> Removendo ambiente de testes..."
  $COMPOSE down --volumes --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

echo "==> Construindo imagens e subindo infraestrutura..."
$COMPOSE build --quiet
$COMPOSE up -d postgres_test redis_test

echo "==> Aguardando banco e redis ficarem saudáveis..."
$COMPOSE up --exit-code-from jest_runner jest_runner
JEST_EXIT=$?

echo ""
echo "========================================"
echo "  RESULTADO JEST: exit code $JEST_EXIT"
echo "========================================"

echo ""
echo "==> Subindo API para testes Postman..."
$COMPOSE up -d api_test

echo "==> Executando Newman (Postman)..."
$COMPOSE up --exit-code-from newman_runner newman_runner
NEWMAN_EXIT=$?

echo ""
echo "========================================"
echo "  RESULTADO NEWMAN: exit code $NEWMAN_EXIT"
echo "========================================"

if [ $JEST_EXIT -ne 0 ] || [ $NEWMAN_EXIT -ne 0 ]; then
  echo ""
  echo "❌ Testes falharam. Jest=$JEST_EXIT Newman=$NEWMAN_EXIT"
  exit 1
fi

echo ""
echo "✅ Todos os testes passaram."
