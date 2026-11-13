"""CPU background worker. Only public listing text/photos enter SigLIP 2; never shopper data."""
import io, ipaddress, json, os, socket, time, urllib.parse, urllib.request
from pathlib import Path

ORIGIN = os.environ.get("SHOPPING_ORIGIN", "https://onbluebird.com").rstrip("/")
TOKEN = os.environ["SHOPPING_JOB_SECRET"]
ENDPOINT = ORIGIN + "/api/internal/shopping-embeddings"

def api(body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(ENDPOINT, data=data, headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json", "User-Agent": "Bluebird-Shopping-Embedding-Worker/1.0"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 4:
                raise
        # Reads and hash-keyed upserts are idempotent across transient host failures.
        time.sleep(2 ** (attempt + 1))

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def public_image(url):
    """Reject local/private destinations on every redirect; bound image download and decoding."""
    opener = urllib.request.build_opener(NoRedirect)
    for _ in range(5):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None,443):
            raise ValueError("Unsupported image URL")
        addresses = socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise ValueError("Nonpublic image destination")
        try:
            response = opener.open(urllib.request.Request(url,headers={"User-Agent":"Bluebird-Public-Listing-Embeddings/1.0"}),timeout=15)
        except urllib.error.HTTPError as error:
            if error.code in (301,302,303,307,308):
                url=urllib.parse.urljoin(url,error.headers["Location"]);continue
            raise
        with response:
            if not response.headers.get("Content-Type","").startswith("image/"):
                raise ValueError("Not an image")
            raw=response.read(8_000_001)
            if len(raw)>8_000_000: raise ValueError("Image too large")
            image=Image.open(io.BytesIO(raw));image.thumbnail((1024,1024));return image.convert("RGB")
    raise ValueError("Too many redirects")

if __name__ == "__main__":
    started=time.monotonic();batch=api()
    if not batch["items"]:
        print("No changed listings; no model compute needed.");raise SystemExit(0)
    import torch
    from PIL import Image
    from transformers import AutoModel, AutoProcessor
    Image.MAX_IMAGE_PIXELS=30_000_000
    torch.set_num_threads(2)
    model_id="google/siglip2-base-patch16-224"
    # Pin the public checkpoint, with no remote model code execution.
    revision="75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2"
    processor=AutoProcessor.from_pretrained(model_id,revision=revision,trust_remote_code=False)
    model=AutoModel.from_pretrained(model_id,revision=revision,trust_remote_code=False).eval()
    stored=0;photos=0
    for _ in range(16):
        results=[]
        for item in batch["items"]:
            with torch.inference_mode():
                text=processor(text=[item["text"]],padding="max_length",truncation=True,max_length=64,return_tensors="pt")
                vector=model.get_text_features(**text);vector=vector/vector.norm(dim=-1,keepdim=True)
                try:
                    if item.get("image"):
                        image=public_image(item["image"])
                        image_vector=model.get_image_features(**processor(images=image,return_tensors="pt"))
                        image_vector=image_vector/image_vector.norm(dim=-1,keepdim=True)
                        vector=0.5*vector+0.5*image_vector;photos+=1
                except Exception:
                    pass  # Text remains useful when a public thumbnail is unavailable.
                vector=vector/vector.norm(dim=-1,keepdim=True)
                results.append({"id":item["id"],"hash":item["hash"],"vector":vector[0].tolist()})
        for offset in range(0,len(results),32):
            stored+=api({"model":batch["model"],"items":results[offset:offset+32]})["stored"]
        print(f"Stored {stored} current listing vectors; {photos} include images.",flush=True)
        if time.monotonic()-started>2100:break
        batch=api()
        if not batch["items"]:break
    print(f"Finished in {round(time.monotonic()-started)} seconds.")
