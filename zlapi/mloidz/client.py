import time
import requests

class APIbykaivesion7:
    def __init__(self, turbo=False, proxy=None):
        self.turbo = turbo
        self.proxy = proxy
        self.stats = {}

    def get(self, url):
        start = time.time()
        response = requests.get(url, proxies={"http": self.proxy, "https": self.proxy} if self.proxy else None)
        elapsed = time.time() - start
        self.stats[url] = elapsed
        return response.text

    def spam(self, url, times=10):
        for _ in range(times):
            try:
                self.get(url)
            except:
                continue