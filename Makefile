deploy-nvidia:
	docker compose -f docker-compose.yaml -f docker-compose.nvidia.yaml up -d

deploy-mac:
	docker compose -f docker-compose.yaml -f docker-compose.mac.yaml up -d

deploy-cpu:
# A fallback for old laptops with no GPU
	docker compose up -d
