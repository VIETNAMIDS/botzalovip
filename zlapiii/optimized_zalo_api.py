import aiohttp
import asyncio
import random
import time
import concurrent.futures
from aiohttp import ClientSession, TCPConnector

class FastAPIClient:
    def __init__(self):
        self.session = None
        self.data_cache = {}
        self.retry_attempts = 5  # Tăng số lần thử lại khi bị giới hạn API
        self.proxy_list = ["http://proxy1.com", "http://proxy2.com"]  # Danh sách proxy để tránh quét API
        self.headers_list = [
            {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
        ]

    async def init_session(self):
        if self.session is None:
            self.session = ClientSession(
                connector=TCPConnector(limit=2000, ssl=False, use_dns_cache=True),
                headers=random.choice(self.headers_list)
            )

    async def fetch(self, url, params=None, headers=None):
        await self.init_session()
        for attempt in range(self.retry_attempts):
            try:
                proxy = random.choice(self.proxy_list)
                async with self.session.get(url, params=params, headers=headers, proxy=proxy, timeout=0.001) as response:
                    return await response.json()
            except Exception as e:
                await asyncio.sleep(random.uniform(0.001, 0.002))  # Tránh bị quét API, tăng nhạy chống delay
        return None

    async def post(self, url, data=None, headers=None):
        await self.init_session()
        for attempt in range(self.retry_attempts):
            try:
                proxy = random.choice(self.proxy_list)
                async with self.session.post(url, json=data, headers=headers, proxy=proxy, timeout=0.001) as response:
                    return await response.json()
            except Exception as e:
                await asyncio.sleep(random.uniform(0.001, 0.002))
        return None

    async def batch_fetch(self, urls):
        await self.init_session()
        tasks = [self.fetch(url) for url in urls]
        return await asyncio.gather(*tasks, return_exceptions=True)

    async def prefetch(self, urls):
        """Tải trước dữ liệu để giảm độ trễ, tăng phản hồi nhanh"""
        responses = await self.batch_fetch(urls)
        for url, response in zip(urls, responses):
            self.data_cache[url] = response

    async def close(self):
        if self.session:
            await self.session.close()
            self.session = None

fast_api_client = FastAPIClient()

# Multi-threading support for additional speed
def run_in_threadpool(fn, *args):
    with concurrent.futures.ThreadPoolExecutor(max_workers=500) as executor:
        future = executor.submit(fn, *args)
        return future.result()

# Tạo delay ngẫu nhiên giữa các request để tránh bị chặn, tối ưu chống delay
def random_delay():
    time.sleep(random.uniform(0.001, 0.002))
