from curl_cffi import requests
import uiautomator2 as u2
import time
import os
import sys
import json
import random
import threading
import subprocess
from concurrent.futures import ThreadPoolExecutor
import re 
import uuid

os.system('color') 
W = '\033[0m'   
R = '\033[91m' 
G = '\033[92m'  
Y = '\033[93m' 
B = '\033[94m' 
M = '\033[95m'
C = '\033[96m'

NAMA_APK_MODIF = "com.example.tes_apk_browser"
NAMA_APK_LITE  = "com.facebook.lite"
FILE_SIMPANAN = "api_keys.json"
FILE_AKUN = "akun.txt" 
MAX_PRICE_USD = 0.15 

DATA_PROVIDER = {
    "HeroSMS": {"url": "https://hero-sms.com/stubs/handler_api.php", "service": "fb"},
    "5SIM": {"url": "http://api1.5sim.net/stubs/handler_api.php", "service": "facebook"},
    "SMSBower": {"url_sms": "https://smsbower.page/stubs/handler_api.php", "url_mail": "https://smsbower.page/api/mail", "service": "fb"},
    "SMSCode": {"url": "https://api.smscode.gg", "service": "facebook"}
}

TIER_CFG = {
    'Bronze': {'color': Y, 'icon': '🥉'},
    'Silver': {'color': M, 'icon': '🥈'},
    'Gold':   {'color': G, 'icon': '🥇'},
}

api_session = requests.Session(impersonate="chrome120")
file_lock = threading.Lock()
ip_limit_lock = threading.Lock()
api_lock = threading.Lock()
counter_lock = threading.Lock()

jumlah_worker_aktif = 0
last_cookie = "" 

def coba_koneksi(port):
    try:
        subprocess.run(['adb', 'connect', f'127.0.0.1:{port}'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=1)
    except Exception: 
        pass

def pick_best_port(device_list):
    def score(dev):
        if dev.startswith("127.0.0.1:75"): return 3
        elif dev.startswith("127.0.0.1:55"): return 2
        else: return 1
    return sorted(device_list, key=score, reverse=True)[0]

def dapatkan_perangkat_adb():
    print(f"{W}[SISTEM] Memindai jaringan dan memverifikasi Android ID unik...")
    daftar_port = []
    daftar_port.extend(range(7555, 7585))
    daftar_port.extend(range(5554, 5585))
    daftar_port.extend(range(16384, 16420))
    with ThreadPoolExecutor(max_workers=30) as executor:
        executor.map(coba_koneksi, daftar_port)
    time.sleep(2) 
    result = subprocess.run(["adb", "devices"], capture_output=True, text=True)
    lines = result.stdout.strip().split("\n")[1:]
    groups = {}
    for line in lines:
        if "device" in line and "offline" not in line:
            device_id = line.split()[0]
            try:
                android_id = subprocess.run(
                    ["adb", "-s", device_id, "shell", "settings", "get", "secure", "android_id"],
                    capture_output=True, text=True, timeout=2
                ).stdout.strip()
                if android_id:
                    if android_id not in groups: groups[android_id] = []
                    groups[android_id].append(device_id)
            except Exception: 
                pass
    final_devices = []
    for android_id, devs in groups.items():
        best = pick_best_port(devs)
        final_devices.append(best)
    return final_devices

def muat_api_tersimpan():
    if os.path.exists(FILE_SIMPANAN):
        try:
            with open(FILE_SIMPANAN, 'r') as f: return json.load(f)
        except Exception: 
            return {}
    return {}

def simpan_api(name, key):
    data = muat_api_tersimpan()
    data[name] = key
    with open(FILE_SIMPANAN, 'w') as f: json.dump(data, f, indent=4)

def api_request(api_url, action, params=None):
    if params is None: params = {}
    if action: params['action'] = action
    with api_lock:
        try: return api_session.get(api_url, params=params, timeout=15)
        except Exception: return None

def cek_status_api(url, key):
    if "smscode.gg" in url:
        with api_lock:
            try:
                res = api_session.get(f"{url}/v2/balance", headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, timeout=15)
                if res and res.status_code == 200 and res.json().get("success"):
                    return float(res.json()["data"]["balance"]["amount"])
            except Exception: pass
        return -1
    res = api_request(url, 'getBalance', {'api_key': key})
    if res and res.status_code == 200 and "ACCESS_BALANCE" in res.text:
        return float(res.text.split(":")[1])
    return -1

def dapatkan_service_id_smscode(api_key, country_id):
    with api_lock:
        try:
            res = api_session.get("https://api.smscode.gg/v2/catalog/services", headers={"Authorization": f"Bearer {api_key}"}, params={"country_id": country_id}, timeout=15)
            if res and res.status_code == 200:
                data = res.json()
                for x in data.get("data", []):
                    if x.get("active") and ("facebook" in x["name"].lower() or x["code"].lower() == "facebook"):
                        return str(x["id"])
        except Exception: pass
    return None

def fetch_providers_v3(api_key, country_id):
    url_sms = DATA_PROVIDER["SMSBower"]["url_sms"]
    res = api_request(url_sms, 'getPricesV3', {'api_key': api_key, 'country': country_id, 'service': 'fb'})
    if not res or res.status_code != 200: return None
    try: raw = res.json()
    except Exception: return None
    service_data = None
    country_str = str(country_id)
    if country_str in raw:
        c_data = raw[country_str]
        if 'fb' in c_data: service_data = c_data['fb']
    if service_data is None:
        for c_key, c_val in raw.items():
            if isinstance(c_val, dict) and 'fb' in c_val: 
                service_data = c_val['fb']; break
    if not service_data: return None
    providers = []
    for listing_key, info in service_data.items():
        if not isinstance(info, dict): continue
        price = float(info.get('price', 0))
        count = int(info.get('count', 0))
        provider_id = str(info.get('provider_id', listing_key))
        if price > 0 and count > 0:
            providers.append({'provider_id': provider_id, 'price': price, 'count': count})
    return providers

def klasifikasi_rank(providers):
    if not providers: return {'Bronze': [], 'Silver': [], 'Gold': []}
    sorted_p = sorted(providers, key=lambda x: (x['price'], -x['count']))
    n = len(sorted_p)
    if n == 1: return {'Bronze': sorted_p, 'Silver': [], 'Gold': []}
    elif n == 2: return {'Bronze': [sorted_p[0]], 'Silver': [], 'Gold': [sorted_p[1]]}
    else:
        c1 = max(1, n // 3); c2 = max(2, (2 * n) // 3)
        return {'Bronze': sorted_p[:c1], 'Silver': sorted_p[c1:c2], 'Gold': sorted_p[c2:]}

def tampilkan_dan_pilih_rank(api_key, country_id, provider_name="SMSBower"):
    if provider_name == "SMSCode":
        platform_id = dapatkan_service_id_smscode(api_key, country_id)
        if not platform_id:
            print(f"{R}[!] Tidak dapat menemukan layanan Facebook di SMSCode untuk negara ini.{W}")
            return None
        
        products = []
        page = 1
        with api_lock:
            while True:
                try:
                    res = api_session.get(
                        "https://api.smscode.gg/v2/catalog/products",
                        headers={"Authorization": f"Bearer {api_key}"},
                        params={"country_id": country_id, "platform_id": platform_id, "sort": "price_asc", "limit": 1000, "page": page},
                        timeout=15
                    )
                    if res and res.status_code == 200:
                        data = res.json()
                        batch = data.get("data", [])
                        products.extend(p for p in batch if p.get("active") and p.get("available", 0) > 0)
                        meta = data.get("meta", {})
                        if len(batch) < meta.get("limit", 1000): break
                        page += 1
                    else:
                        break
                except Exception:
                    break
        
        if not products: return None
        products.sort(key=lambda x: float(x["price"]["amount"]))
        
        n = len(products)
        size = -(-n // 3)
        tiers = [products[0:size], products[size:2 * size], products[2 * size:]]
        tier_names = ['Bronze', 'Silver', 'Gold']
        
        print(f"\n{C}╔══════════════════════════════════════════════════════╗{W}")
        print(f"{C}║                  PILIH RANK / TIER PROVIDER          ║{W}")
        print(f"{C}╚══════════════════════════════════════════════════════╝{W}")
        
        tier_menu = []
        for i, tier_name in enumerate(tier_names):
            tp = tiers[i]
            if not tp: continue
            cfg = TIER_CFG[tier_name]
            lo = float(tp[0]["price"]["amount"])
            hi = float(tp[-1]["price"]["amount"])
            p_str = f"${lo:.3f} - ${hi:.3f}"
            total_stok = sum(int(p["available"]) for p in tp)
            print(f"{cfg['color']}   [{len(tier_menu)+1}] {cfg['icon']} {tier_name:<8} | Harga: {p_str:<22} | Total Stok: {total_stok}{W}")
            tier_menu.append((tier_name, tp))
            
        if not tier_menu: return None
        t_idx = int(input(f"\n{W}  Pilih Tier (1-{len(tier_menu)}): ").strip()) - 1
        sel_tier_name, sel_products = tier_menu[t_idx]
        
        for i, prov in enumerate(sel_products):
            print(f"[{i+1}] ID: {prov['id']} | Harga: ${float(prov['price']['amount']):.3f} | Stok: {prov['available']}")
        p_idx = int(input(f"\nPilih Provider untuk DIKUNCI (1-{len(sel_products)}): ").strip()) - 1
        sel_p = sel_products[p_idx]
        return {'provider_id': str(sel_p['id']), 'price': float(sel_p['price']['amount']), 'count': int(sel_p['available'])}

    providers = fetch_providers_v3(api_key, country_id)
    if not providers: return None
    tiers = klasifikasi_rank(providers)
    print(f"\n{C}╔══════════════════════════════════════════════════════╗{W}")
    print(f"{C}║                  PILIH RANK / TIER PROVIDER          ║{W}")
    print(f"{C}╚══════════════════════════════════════════════════════╝{W}")
    tier_menu = []
    for tier_name in ['Bronze', 'Silver', 'Gold']:
        tp = tiers[tier_name]
        if not tp: continue
        cfg = TIER_CFG[tier_name]
        p_str = f"${min(p['price'] for p in tp):.3f} - ${max(p['price'] for p in tp):.3f}"
        print(f"{cfg['color']}   [{len(tier_menu)+1}] {cfg['icon']} {tier_name:<8} | Harga: {p_str:<22} | Total Stok: {sum(p['count'] for p in tp)}{W}")
        tier_menu.append((tier_name, tp))
    t_idx = int(input(f"\n{W}  Pilih Tier (1-{len(tier_menu)}): ").strip()) - 1
    sel_tier_name, sel_providers = tier_menu[t_idx]
    sel_providers.sort(key=lambda x: (x['price'], -x['count']))
    for i, prov in enumerate(sel_providers):
        print(f"[{i+1}] ID: {prov['provider_id']} | Harga: ${prov['price']:.3f} | Stok: {prov['count']}")
    p_idx = int(input(f"\nPilih Provider untuk DIKUNCI (1-{len(sel_providers)}): ").strip()) - 1
    return sel_providers[p_idx]

def beli_nomor(api_url, api_key, service, country, provider_name, provider_id=None, harga_lock=None):
    if provider_name == "SMSCode":
        if provider_id and int(provider_id) > 0:
            ikey = str(uuid.uuid4())
            with api_lock:
                try:
                    res = api_session.post(
                        "https://api.smscode.gg/v2/orders/create",
                        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "idempotency-key": ikey},
                        json={"product_id": int(provider_id), "quantity": 1},
                        timeout=15
                    )
                    if res and res.status_code == 200:
                        data = res.json()
                        if data.get("success"):
                            orders = data.get("data", {}).get("orders", [])
                            if orders:
                                order = orders[0]
                                return str(order["id"]), str(order["phone_number"])
                except Exception: pass
        return None, "NO_NUMBERS"

    params = {'api_key': api_key, 'service': service, 'country': country}
    action_endpoint = 'getNumberV2' if provider_name == "HeroSMS" else 'getNumber'
    if provider_name == "HeroSMS": 
        params['maxPrice'] = str(MAX_PRICE_USD)
    elif provider_name == "SMSBower" and provider_id and provider_id != "any":
        params['providerIds'] = str(provider_id)
        if harga_lock: params['maxPrice'] = str(float(harga_lock) + 0.003)
    for _ in range(5):
        res = api_request(api_url, action_endpoint, params)
        if res and res.status_code == 200:
            if "{" in res.text and "}" in res.text:
                try:
                    data = json.loads(res.text)
                    if "activationId" in data and "phoneNumber" in data:
                        return str(data["activationId"]), str(data["phoneNumber"])
                except Exception: 
                    pass
            if "ACCESS_NUMBER" in res.text:
                parts = res.text.split(":")
                if len(parts) >= 3: return parts[1], parts[2].strip()
            elif "TOO_MANY_ACTIVE_RENTALS" in res.text or "too_many_active" in res.text.lower():
                time.sleep(10)
                return None, None
            elif "NO_NUMBERS" in res.text:
                time.sleep(2)
                continue
            else:
                time.sleep(3)
        else:
            time.sleep(3) 
    return None, "NO_NUMBERS"

def tunggu_otp(api_url, api_key, act_id, timeout=60): 
    if "smscode.gg" in api_url:
        start_time = time.time()
        while time.time() - start_time < timeout:
            with api_lock:
                try:
                    res = api_session.get("https://api.smscode.gg/v2/orders/active", headers={"Authorization": f"Bearer {api_key}"}, timeout=15)
                    if res and res.status_code == 200:
                        data = res.json()
                        current = next((o for o in data.get("data", []) if str(o["id"]) == str(act_id)), None)
                        if current:
                            if current.get("status") == "OTP_RECEIVED" and current.get("otp_code"):
                                return str(current["otp_code"])
                        else:
                            res_final = api_session.get(f"https://api.smscode.gg/v2/orders/{act_id}", headers={"Authorization": f"Bearer {api_key}"}, timeout=15)
                            if res_final and res_final.status_code == 200:
                                final_data = res_final.json().get("data", {})
                                if final_data.get("otp_code"):
                                    return str(final_data["otp_code"])
                except Exception: pass
            time.sleep(10)
        return None

    start_time = time.time()
    while time.time() - start_time < timeout:
        res = api_request(api_url, 'getStatus', {'api_key': api_key, 'id': act_id})
        if res and res.status_code == 200 and "STATUS_OK" in res.text:
            return res.text.split(":")[1]
        time.sleep(10) 
    return None

def batalkan_nomor(api_url, api_key, act_id):
    if "smscode.gg" in api_url:
        with api_lock:
            for _ in range(5):
                try:
                    res = api_session.post(
                        "https://api.smscode.gg/v2/orders/cancel",
                        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                        json={"id": int(act_id)},
                        timeout=15
                    )
                    if res and res.status_code == 200 and res.json().get("success"):
                        print(f"{Y}[API] Sukses membatalkan order SMSCode ID: {act_id}{W}")
                        break
                    elif res and res.status_code == 409:
                        time.sleep(5)
                except Exception:
                    time.sleep(2)
        return
    api_request(api_url, 'setStatus', {'api_key': api_key, 'id': act_id, 'status': 8})

def selesaikan_nomor(api_url, api_key, act_id):
    if "smscode.gg" in api_url:
        with api_lock:
            try:
                res = api_session.post(
                    "https://api.smscode.gg/v2/orders/finish",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={"id": int(act_id)},
                    timeout=15
                )
                if res and res.status_code == 200 and res.json().get("success"):
                    print(f"{G}[API] Sukses menyelesaikan order SMSCode ID: {act_id}{W}")
            except Exception:
                pass
        return
    api_request(api_url, 'setStatus', {'api_key': api_key, 'id': act_id, 'status': 6})

def eksekusi_clear_web_browser(d, log_func):
    log_func("Membersihkan Sesi Selesai (Klik Tombol Clear Web)...")
    tombol_resik = None
    if d(description="Clear Web").exists():
        tombol_resik = d(description="Clear Web")
    elif d(text="Clear Web").exists():
        tombol_resik = d(text="Clear Web")
    elif d(description="Reset Browser").exists():
        tombol_resik = d(description="Reset Browser")
    elif d(text="Reset Browser").exists():
        tombol_resik = d(text="Reset Browser")
    
    if tombol_resik:
        tombol_resik.click()
        time.sleep(3)
    else:
        log_func("Tombol tidak terindeks, mengeksekusi klik koordinat ikon refresh [690, 72]...")
        d.click(690, 72)
        time.sleep(0.5)
        d.click(690, 72)
        time.sleep(3)

    tombol_ya = None
    for txt_ya in ["YA, HAPUS", "Hapus", "Yes", "YA", "hapus", "OK"]:
        if d(text=txt_ya).exists():
            tombol_ya = d(text=txt_ya); break
        elif d(description=txt_ya).exists():
            tombol_ya = d(description=txt_ya); break
    if tombol_ya:
        tombol_ya.click()
        time.sleep(2)
        return True
    return True

def simpan_hasil_akun(data_utama, info_tambahan=""):
    with file_lock:
        with open(FILE_AKUN, "a") as f:
            f.write(f"{data_utama}|{info_tambahan}\n" if info_tambahan else f"{data_utama}\n")

def generate_nama_bule():
    fn = [
        "Emma", "Olivia", "Ava", "Isabella", "Sophia", "Mia", "Amelia", "Harper", "Evelyn", "Abigail", 
        "Emily", "Elizabeth", "Mila", "Ella", "Avery", "Sofia", "Camila", "Aria", "Scarlett", "Victoria", 
        "Madison", "Luna", "Grace", "Chloe", "Penelope", "Layla", "Riley", "Zoey", "Nora", "Lily", 
        "Eleanor", "Hannah", "Lillian", "Addison", "Aubrey", "Ellie", "Stella", "Natalie", "Zoe", "Leah", 
        "Hazel", "Violet", "Aurora", "Savannah", "Audrey", "Brooklyn", "Bella", "Claire", "Skylar", "Lucy", 
        "Anna", "Samantha", "Caroline", "Kennedy", "Maya", "Ruby", "Eva", "Alice", "Elena"
    ]
    ln = [
        "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", 
        "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin", 
        "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", 
        "Walker", "Young", "Allen", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", 
        "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts", 
        "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker", "Cruz", "Edwards", "Collins"
    ]
    return random.choice(fn), random.choice(ln)

def beli_email(api_key, service):
    url = f"{DATA_PROVIDER['SMSBower']['url_mail']}/getActivation"
    res = api_request(url, action=None, params={'api_key': api_key, 'service': service, 'domain': 'gmail.com'})
    if res and res.status_code == 200:
        try:
            data = res.json()
            if data.get("status") == 1: return str(data['mailId']), str(data['mail'])
        except Exception: pass
    return None, None

def tunggu_otp_email(api_key, mail_id, timeout=60): 
    url = f"{DATA_PROVIDER['SMSBower']['url_mail']}/getCode"
    start_time = time.time()
    while time.time() - start_time < timeout:
        res = api_request(url, action=None, params={'api_key': api_key, 'mailId': mail_id})
        if res and res.status_code == 200:
            try:
                data = res.json()
                if data.get("status") == 1: return str(data["code"])
            except Exception: pass
        time.sleep(10)
    return None

def batalkan_email(api_key, mail_id):
    url = f"{DATA_PROVIDER['SMSBower']['url_mail']}/setStatus"
    api_request(url, action=None, params={'api_key': api_key, 'id': mail_id, 'status': 2})

def penjaga_latar_belakang(d):
    while True:
        try:
            if d(textMatches="(?i).*(Choose an account|Pilih akun).*").exists(): d.press("back"); time.sleep(2)
            if d(textMatches="(?i).*(Tolak|Deny|None of the above|Tidak ada di atas).*").exists(): d(textMatches="(?i).*(Tolak|Deny|None of the above|Tidak ada di atas).*").click(); time.sleep(2)
            if d(textMatches="(?i).*(Download additional files|Unduh file tambahan).*").exists(): d.press("back"); time.sleep(2)
        except Exception: pass 
        time.sleep(2) 

def klik_bahasa(d, list_kata, timeout=10):
    start = time.time()
    while time.time() - start < timeout:
        for kata in list_kata:
            if d(textMatches=f"(?i).*{kata}.*").exists():
                try:
                    d(textMatches=f"(?i).*{kata}.*").click()
                    time.sleep(2)
                    return True
                except Exception: pass
        time.sleep(1)
    return False

def klik_didnt_get_code_fblite(d):
    kata_kunci = ["I didn’t get the code", "I didn't get the code", "Saya tidak mendapatkan kode"]
    for kata in kata_kunci:
        if d(text=kata).exists(): d(text=kata).click(); time.sleep(2); return True
    if d(textContains="get the code").exists(): d(textContains="get the code").click(); time.sleep(2); return True
    if d(textContains="mendapatkan kode").exists(): d(textContains="mendapatkan kode").click(); time.sleep(2); return True
    return False

def i(d, password_fb):
    time.sleep(8) 
    try:
        perintah_shell = "su -c 'cat /data/data/com.facebook.lite/shared_prefs/*.xml'"
        hasil_baca = d.shell(perintah_shell).output
        pola_uid = r'\b(615\d{11,12}|1000\d{11,12})\b'
        kumpulan_angka = re.findall(pola_uid, hasil_baca)
        if kumpulan_angka:
            uid_unik = list(set(kumpulan_angka))
            return uid_unik[0]
    except Exception: pass
    return None 

def ambil_daftar_negara_api(api_url, api_key):
    print(f"{W}[SISTEM] Mengekstrak daftar negara dari server API...")
    negara_dict = {
        "russia": "0", "ukraine": "1", "kazakhstan": "2", "china": "3", "philippines": "43", 
        "myanmar": "32", "indonesia": "6", "malaysia": "7", "kenya": "8", "tanzania": "9", 
        "vietnam": "161", "kyrgyzstan": "11", "usa": "187", "usa virtual": "187", "united states virtual": "187", "united states": "187", "israel": "13", "hong kong": "14", 
        "poland": "15", "uk": "16", "england": "16", "madagascar": "17", "congo": "18", 
        "nigeria": "32", "macao": "20", "egypt": "21", "india": "18", "ireland": "23", 
        "cambodia": "31", "laos": "25", "haiti": "26", "ivory coast": "27", "gambia": "28", 
        "serbia": "29", "yemen": "167", "south africa": "32", "romania": "32", "colombia": "33", 
        "estonia": "34", "azerbaijan": "35", "canada": "36", "morocco": "61", "ghana": "38", 
        "argentina": "16", "uzbekistan": "40", "cameroon": "41", "chad": "42", "germany": "43", 
        "lithuania": "44", "croatia": "45", "sweden": "46", "iraq": "47", "netherlands": "48", 
        "latvia": "49", "austria": "50", "belarus": "51", "thailand": "10", "saudi arabia": "53", 
        "mexico": "60", "taiwan": "55", "spain": "56", "iran": "57", "algeria": "58", 
        "slovenia": "59", "bangladesh": "115", "senegal": "61", "turkey": "62", "czech": "63", 
        "sri lanka": "64", "peru": "65", "pakistan": "19", "new zealand": "67", "guinea": "68", 
        "mali": "69", "venezuela": "70", "ethiopia": "71", "mongolia": "72", "brazil": "73",
        "afghanistan": "74", "uganda": "75", "angola": "76", "cyprus": "77", "france": "78",
        "papua new guinea": "79", "mozambique": "80", "nepal": "81", "belgium": "82", "bulgaria": "83",
        "hungary": "84", "moldova": "85", "italy": "86", "paraguay": "87", "honduras": "88",
        "tunisia": "89", "nicaragua": "90", "timor leste": "91", "bolivia": "92", "costa rica": "93",
        "guatemala": "94", "uae": "95", "zimbabwe": "96", "puerto rico": "97", "sudan": "98",
        "togo": "99", "kuwait": "100", "el salvador": "101", "libya": "102", "jamaica": "103",
        "trinidad": "104", "ecuador": "105", "swaziland": "106", "oman": "107", "boxnia": "108",
        "dominican republic": "109", "syria": "110", "qatar": "111", "panama": "112", "cuba": "113",
        "mauritania": "114", "sierra leone": "115", "jordan": "116", "portugal": "117", "barbados": "118",
        "burundi": "119", "benin": "120", "brunei": "121", "bahamas": "122", "botswana": "123",
        "belize": "124", "central african republic": "125", "dominica": "126", "grenada": "127",
        "georgia": "128", "greece": "129", "guinea-bissau": "130", "guyana": "131", "iceland": "132",
        "comoros": "133", "st kitts": "134", "liechtenstein": "135", "equatorial guinea": "136",
        "djibouti": "137", "suriname": "138", "gabon": "139", "lesotho": "140", "bahrain": "145"
    }
    
    if "smscode.gg" in api_url:
        with api_lock:
            try:
                res = api_session.get(f"{api_url}/v2/catalog/countries", headers={"Authorization": f"Bearer {api_key}"}, timeout=15)
                if res and res.status_code == 200:
                    data = res.json()
                    for x in data.get("data", []):
                        if x.get("active"):
                            negara_dict[x["name"].lower().strip()] = str(x["id"])
            except Exception: pass
        return negara_dict

    res = api_request(api_url, 'getCountries', {'api_key': api_key})
    if res and res.status_code == 200:
        try:
            data = res.json()
            for key, val in data.items():
                if isinstance(val, dict) and 'eng' in val:
                    negara_dict[val['eng'].lower().strip()] = str(val.get('id', key))
                elif isinstance(val, str):
                    negara_dict[val.lower().strip()] = str(key)
        except Exception: pass
    return negara_dict

def input_negara_pintar(daftar_negara_api):
    nama_text_list = list(daftar_negara_api.keys())
    while True:
        try:
            ketik = input(f"{W}\n  Ketik nama / awalan negara (contoh: 'usa' atau 'usa virtual'): ").strip().lower()
            if not ketik:
                continue

            if ketik in daftar_negara_api:
                return daftar_negara_api[ketik]

            kecocokan = [n for n in nama_text_list if ketik in n]
            
            if len(kecocokan) == 1:
                if input(f"  > Maksud Anda '{kecocokan[0].title()}'? (y/n): ").strip().lower() == 'y':
                    return daftar_negara_api[kecocokan[0]]
            elif len(kecocokan) > 1:
                print(f"{C}  Ditemukan beberapa negara yang cocok:{W}")
                for idx, k in enumerate(kecocokan, 1):
                    print(f"  [{idx}] {k.title()}")
                pilihan = input(f"  Pilih nomor negara (1-{len(kecocokan)}): ").strip()
                if pilihan.isdigit():
                    p_idx = int(pilihan) - 1
                    if 0 <= p_idx < len(kecocokan):
                        return daftar_negara_api[kecocokan[p_idx]]
            else:
                print(f"{R}  [!] Negara tidak ditemukan. Coba ketik nama negara lain.{W}")
        except Exception:
            pass

def jalankan_otomatisasi_fb(d, id_emu, target_id_awal, alamat_kontak_awal, password_fb, api_url, api_key, provider_name, service, country, tipe_kontak, provider_id=None, harga_lock=None):
    target_id = target_id_awal
    alamat_kontak = alamat_kontak_awal
    last_activity = time.time()
    
    def update_activity():
        nonlocal last_activity; last_activity = time.time()
    def is_stuck():
        if time.time() - last_activity > 60: return True
        return False
    def log(pesan, warna=W):
        print(f"{warna}[{id_emu}] {pesan}{W}")

    def klik_tombol_biru_fb():
        try:
            for txt in ["Sign up", "Next", "Lanjutkan", "Daftar", "Continue", "OK"]:
                target_btn = d(className="android.widget.Button", text=txt)
                if target_btn.exists():
                    bounds = target_btn.info.get('bounds', {})
                    if bounds and bounds.get('top', 0) >= 383 and bounds.get('bottom', 0) <= 1226:
                        target_btn.click()
                        return True
            for elem in d(classNameMatches="android.widget.(TextView|Button|View)"):
                info = elem.info
                bounds = info.get('bounds', {})
                if bounds:
                    top = bounds.get('top', 0)
                    bottom = bounds.get('bottom', 0)
                    text = info.get('text', '')
                    if top >= 383 and bottom <= 1226:
                        if text in ["Sign up", "Next", "Lanjutkan", "Daftar", "Continue", "OK"]:
                            elem.click()
                            return True
        except Exception:
            pass 
        return False

    try:
        log("Mencari tombol pendaftaran awal di halaman login utama...")
        if is_stuck(): return False, target_id
        
        if klik_bahasa(d, ["Buat Akun Baru", "Create new account", "Buat akun baru"], timeout=15):
            log("Tombol pendaftaran awal (Halaman Login Utama) diklik. Jeda 10 detik agar halaman berganti...", Y)
            time.sleep(15)
        update_activity()
        
        for _ in range(8):
            if d(className="android.widget.EditText").exists():
                break
                
            target_desc = d(descriptionMatches="(?i)^(Get started|Mulai|Create new account|Buat akun baru|Buat Akun Baru)$", clickable=True)
            if target_desc.exists():
                target_desc.click()
                log("Tombol pendaftaran kedua berhasil diklik.", Y)
                time.sleep(2)
                update_activity()
                continue
                
            target_text = d(textMatches="(?i)^(Get started|Mulai|Create new account|Buat akun baru|Buat Akun Baru)$", clickable=True)
            if target_text.exists():
                target_text.click()
                log("Tombol pendaftaran kedua berhasil diklik.", Y)
                time.sleep(2)
                update_activity()
                continue
                
            if klik_bahasa(d, ["Get started", "Mulai", "Create new account", "Buat Akun Baru", "Selanjutnya", "Next"], timeout=1):
                log("Tombol pendaftaran kedua diklik via klik_bahasa.", Y)
                time.sleep(2)
                update_activity()
                continue
            time.sleep(1)
            update_activity()

        time.sleep(2)
        update_activity() 

        # 1. NAMA
        if is_stuck(): return False, target_id
        nama_depan, nama_belakang = generate_nama_bule()
        time.sleep(2)
        if d(className="android.widget.EditText").wait(timeout=10):
            edit_boxes = d(className="android.widget.EditText")
            if len(edit_boxes) >= 2:
                edit_boxes[0].click(); edit_boxes[0].clear_text(); edit_boxes[0].set_text(nama_depan)
                edit_boxes[1].click(); edit_boxes[1].clear_text(); edit_boxes[1].set_text(nama_belakang)
            elif len(edit_boxes) == 1:
                edit_boxes[0].click(); edit_boxes[0].clear_text(); edit_boxes[0].set_text(f"{nama_depan} {nama_belakang}")
        klik_bahasa(d, ["Selanjutnya", "Next"]); time.sleep(2)
        update_activity() 

        # 2. UMUR
        if is_stuck(): return False, target_id
        umur_random = str(random.randint(18, 30))
        time.sleep(2); d.press("back"); time.sleep(2)
        klik_bahasa(d, ["Selanjutnya", "Next"], timeout=5); time.sleep(2)
        if d(textMatches="(?i).*(Selanjutnya|Next).*").exists(): klik_bahasa(d, ["Selanjutnya", "Next"], timeout=3); time.sleep(2)
        if d(className="android.widget.EditText").exists(timeout=5):
            time.sleep(2) 
            for edit_box in d(className="android.widget.EditText"):
                edit_box.click(); time.sleep(1); edit_box.clear_text(); time.sleep(1); edit_box.set_text(umur_random); break
            time.sleep(2); klik_bahasa(d, ["Selanjutnya", "Next"], timeout=5); time.sleep(2)
        klik_bahasa(d, ["OK", "Ok", "Setuju"], timeout=3); time.sleep(2)
        update_activity() 

        # 3. GENDER
        if is_stuck(): return False, target_id
        klik_bahasa(d, ["Perempuan", "Female"], timeout=5); time.sleep(2)
        klik_bahasa(d, ["Selanjutnya", "Next"], timeout=3); time.sleep(2)
        update_activity() 

        # 4. KONTAK DENGAN DETEKSI
        if tipe_kontak == "email":
            if d(textMatches="(?i).*(Sign up with email|Daftar dengan email).*").exists():
                klik_bahasa(d, ["Sign up with email", "Daftar with email", "email"], timeout=3); time.sleep(2)
        elif tipe_kontak == "nomor":
            if d(textMatches="(?i).*(Sign up with mobile number|Daftar dengan nomor ponsel).*").exists():
                klik_bahasa(d, ["Sign up with mobile number", "Daftar dengan nomor ponsel"], timeout=3); time.sleep(2)
            
        while True:
            if is_stuck(): return False, target_id
            kontak_input = alamat_kontak
            if tipe_kontak == "nomor" and not alamat_kontak.startswith("+"): kontak_input = "+" + alamat_kontak

            time.sleep(2)
            if d(className="android.widget.EditText").wait(timeout=10):
                for edit_box in d(className="android.widget.EditText"):
                    edit_box.click(); time.sleep(1); edit_box.clear_text(); time.sleep(1); edit_box.set_text(kontak_input); break 
            
            time.sleep(2); klik_bahasa(d, ["Selanjutnya", "Next"])

            kata_kunci_error = ["existing account", "associated with", "sudah terdaftar", "sudah ada akun", "telah digunakan", "recently used", "different number", "coba nomor lain", "valid email", "email yang valid", "has been disabled", "dinonaktifkan", "disabled"]
            kata_kunci_jebakan = ["Confirm another way", "Konfirmasi dengan cara lain", "Account in use", "Akun sedang digunakan"]
            
            kontak_terpakai = False
            terkena_jebakan = False
            
            start_cek = time.time()
            while time.time() - start_cek < 15:
                for err in kata_kunci_error:
                    if d(textMatches=f"(?i).*{err}.*").exists() or d(descriptionMatches=f"(?i).*{err}.*").exists():
                        kontak_terpakai = True; break
                for jebakan in kata_kunci_jebakan:
                    if d(textMatches=f"(?i).*{jebakan}.*").exists() or d(descriptionMatches=f"(?i).*{jebakan}.*").exists():
                        terkena_jebakan = True; break
                if kontak_terpakai or terkena_jebakan or d(textMatches="(?i).*(Password|Kata sandi|Sandi).*").exists(): break
                time.sleep(1)

            if terkena_jebakan:
                log(f"[!] Terkena jebakan halaman 'Account in Use'! Memulihkan jalur...", B)
                for teks in ["Confirm another way", "Konfirmasi dengan cara lain"]:
                    if d(textMatches=f"(?i).*{teks}.*").exists(): d(textMatches=f"(?i).*{teks}.*").click(); break
                    elif d(descriptionMatches=f"(?i).*{teks}.*").exists(): d(descriptionMatches=f"(?i).*{teks}.*").click(); break
                time.sleep(3)
                if tipe_kontak == "email":
                    for teks_email in ["Sign up with email", "Daftar dengan email"]:
                        if d(textMatches=f"(?i).*{teks_email}.*").exists(): d(textMatches=f"(?i).*{teks_email}.*").click(); break
                elif tipe_kontak == "nomor":
                    for teks_nomor in ["Sign up with mobile number", "Daftar dengan nomor ponsel"]:
                        if d(textMatches=f"(?i).*{teks_nomor}.*").exists(): d(textMatches=f"(?i).*{teks_nomor}.*").click(); break
                time.sleep(3)

            if kontak_terpakai or terkena_jebakan:
                log(f"Kontak {kontak_input} terpakai/ditolak! Membeli kontak baru...")
                
                def beli_kontak_baru(current_id):
                    if tipe_kontak == "email":
                        batalkan_email(api_key, current_id)
                        for _ in range(5):
                            if is_stuck(): return None, None
                            tid, ak = beli_email(api_key, service)
                            if tid: return tid, ak
                            time.sleep(3)
                    else:
                        batalkan_nomor(api_url, api_key, current_id)
                        for _ in range(5):
                            if is_stuck(): return None, None
                            tid, ak = beli_nomor(api_url, api_key, service, country, provider_name, provider_id, harga_lock)
                            if tid: return tid, ak
                            time.sleep(3)
                    return None, None

                target_id, alamat_kontak = beli_kontak_baru(target_id)
                if not target_id: return False, target_id 
                update_activity() 
                continue 
            else:
                break 

        update_activity() 

        # 5. PASSWORD
        if is_stuck(): return False, target_id
        log("Menunggu halaman Password...")
        if d(textMatches="(?i).*(Password|Kata sandi|Sandi).*").wait(timeout=20):
            time.sleep(2)
            if d(className="android.widget.EditText").exists():
                for edit_box in d(className="android.widget.EditText"):
                    edit_box.click(); time.sleep(1); edit_box.clear_text(); time.sleep(1); edit_box.set_text(password_fb); break
            time.sleep(2)
            
            if d(className="android.widget.Button", text="Sign up").exists():
                d(className="android.widget.Button", text="Sign up").click()
            else:
                klik_bahasa(d, ["Daftar", "Sign Up", "Sign up", "Selanjutnya", "Next"])
                
            time.sleep(8) 
        else:
            return False, target_id

        if d(textMatches="(?i).*(Save your login info|Simpan info login).*").exists(timeout=6):
            klik_bahasa(d, ["Not now", "Lain kali", "Save", "Simpan"], timeout=5); time.sleep(4)
        update_activity() 

        # I AGREE & LIMIT IP
        if d(textContains="agree").wait(timeout=6) or d(textContains="setuju").wait(timeout=6) or d(descriptionContains="agree").exists():
            while True:
                if is_stuck(): return False, target_id
                time.sleep(2)
                if d(className="android.widget.Button", descriptionMatches="(?i).*(I agree|Saya setuju).*").exists():
                    d(className="android.widget.Button", descriptionMatches="(?i).*(I agree|Saya setuju).*").click()
                elif d(className="android.widget.Button", textMatches="(?i).*(I agree|Saya setuju).*").exists():
                    d(className="android.widget.Button", textMatches="(?i).*(I agree|Saya setuju).*").click()

                start_scan = time.time()
                kena_limit = False
                while time.time() - start_scan < 8:
                    if d(textContains="We couldn't create").exists() or d(textContains="tidak dapat membuat").exists() or d(text="OK").exists() or d(text="Ok").exists():
                        kena_limit = True; break
                    if d(className="android.widget.EditText").exists() or d(textMatches="(?i).*(Send code via SMS|Confirmation code|Try another way|Coba cara lain|with an SMS).*").exists(): break
                    time.sleep(0.3)
                        
                if kena_limit:
                    if d(text="OK").exists(): d(text="OK").click()
                    elif d(text="Ok").exists(): d(text="Ok").click()
                    return False, target_id 
                if d(className="android.widget.EditText").exists() or d(textMatches="(?i).*(Send code via SMS|Confirmation code|Try another way|Coba cara lain|with an SMS).*").exists(): break 
                time.sleep(2)
        update_activity() 

        try:
            if not d(className="android.widget.EditText").exists():
                if d(textMatches="(?i).*(Try another way|Coba cara lain).*").exists():
                    log("Mendeteksi halaman Varian 1 (Try another way). Mengklik Try another way...", Y)
                    d(textMatches="(?i).*(Try another way|Coba cara lain).*").click()
                    time.sleep(4)
                    update_activity()
                elif d(textContains="with an SMS").exists():
                    log("Mendeteksi halaman Varian 2/3 (Confirm with SMS Interstitial). Mengklik Continue...", Y)
                    target_continue = d(textMatches="(?i).*(Continue|Lanjutkan).*")
                    if target_continue.exists():
                        target_continue.click()
                    time.sleep(4)
                    update_activity()
        except Exception as e_baru:
            log(f"Gagal mengevaluasi halaman konfirmasi dinamis: {e_baru}", B)
                    
        percobaan_otp = 1
        resend_done = False 
        
        while True:
            if is_stuck(): return False, target_id
            log(f"Menunggu Verifikasi {tipe_kontak.title()} (Siklus {percobaan_otp})...")
            
            if tipe_kontak == "nomor":
                if d(textContains="WhatsApp").exists() or d(textContains="whatsapp").exists() or d(textMatches="(?i).*(WhatsApp|whatsapp).*").exists() or d(descriptionMatches="(?i).*(WhatsApp|whatsapp).*").exists():
                    log("[🛡️ DETEKSI] Terdeteksi opsi verifikasi WhatsApp aktif di layar!", Y)
                    print(f"{Y}[SISTEM] Mendeteksi jalur WhatsApp , memindahkan alur ke SMS...{W}")
                    
                    if d(textMatches="(?i).*(Send code via SMS|Kirim kode melalui SMS).*").exists():
                        d(textMatches="(?i).*(Send code via SMS|Kirim kode melalui SMS).*").click()
                        time.sleep(3)
                    elif d(textMatches="(?i).*(I didn't get the code|I didn’t get the code|Saya tidak mendapatkan kode).*").exists():
                        d(textMatches="(?i).*(I didn't get the code|I didn’t get the code|Saya tidak mendapatkan kode).*").click()
                        time.sleep(3)
                        for sms_text in ["Send code via SMS", "via SMS", "SMS", "Kirim kode melalui SMS", "Resend SMS"]:
                            if d(textContains=sms_text).exists():
                                d(textContains=sms_text).click()
                                time.sleep(3)
                                break

            sudah_klik_continue = False
            otp_ready = False
            start_wait = time.time()
            while time.time() - start_wait < 30:
                if d(textMatches="(?i).*(Send code via SMS|Kirim kode melalui SMS|Confirm your mobile number|Konfirmasi nomor ponsel).*").exists():
                    if d(textMatches="(?i).*(Send code via SMS|Kirim kode melalui SMS).*").exists():
                        d(textMatches="(?i).*(Send code via SMS|Kirim kode melalui SMS).*").click(); time.sleep(2)
                    
                    if not sudah_klik_continue:
                        tombol_continue = d(textMatches="(?i).*(Continue|Lanjutkan).*")
                        if tombol_continue.exists():
                            tombol_continue.click()
                            sudah_klik_continue = True
                            time.sleep(5)
                            
                    time.sleep(2); continue 
                if d(className="android.widget.EditText").exists() and d(textMatches="(?i).*(Code|Kode|Confirmation|Konfirmasi|5-digit).*").exists():
                    if d(textContains="WhatsApp").exists() or d(textContains="whatsapp").exists():
                        time.sleep(2)
                        break
                    otp_ready = True; break
                time.sleep(2)
                
            if not otp_ready: return False, target_id 

            log("Menunggu SMS OTP Masuk (Masa Tunggu Menit Ke-1)...")
            kode_otp = tunggu_otp(api_url, api_key, target_id, timeout=60)

            if kode_otp:
                log(f"OTP Didapat: {kode_otp}", G)
                time.sleep(2)
                if d(className="android.widget.EditText").exists():
                    for edit_box in d(className="android.widget.EditText"):
                        edit_box.click(); time.sleep(1); edit_box.clear_text(); time.sleep(1); edit_box.set_text(kode_otp); break
                    time.sleep(2)
                    clicked = False
                    btn_texts = ["Ok", "OK", "Selanjutnya", "Next", "Konfirmasi", "Confirm", "Submit"]
                    for btn in btn_texts:
                        if d(className="android.widget.Button", textMatches=f"(?i).*{btn}.*").exists():
                            d(className="android.widget.Button", textMatches=f"(?i).*{btn}.*").click(); clicked = True; break
                        elif d(textMatches=f"(?i).*{btn}.*").exists():
                            d(textMatches=f"(?i).*{btn}.*").click(); clicked = True; break
                    if not clicked: d.press("enter")
                    time.sleep(5)
                update_activity() 
                break 
            else:
                log("Waktu OTP Menit Ke-1 Habis. Memicu Jatah Resend 1x...", B)
                
                if not resend_done:
                    log("[⚡ LOGIKA RESEND] Melakukan Kirim Ulang Kode (Resend)...", Y)
                    if klik_didnt_get_code_fblite(d):
                        time.sleep(3)
                        resend_clicked = False
                        for resend_txt in ["Resend code to SMS", "Resend SMS", "Send code via SMS", "Kirim ulang SMS", "Kirim kode melalui SMS"]:
                            if d(textMatches=f"(?i).*{resend_txt}.*").exists():
                                d(textMatches=f"(?i).*{resend_txt}.*").click()
                                resend_clicked = True
                                log(f"[🟢] Sukses memicu resend: '{resend_txt}'", G)
                                break
                        if not resend_clicked:
                            klik_bahasa(d, ["Next", "Selanjutnya", "Continue", "Lanjutkan"])
                        
                        resend_done = True 
                        time.sleep(5)
                        update_activity()
                        
                        log("Menunggu SMS OTP Masuk Kembali (Masa Tunggu Menit Ke-2)...")
                        kode_otp = tunggu_otp(api_url, api_key, target_id, timeout=60)
                        if kode_otp:
                            log(f"OTP Didapat Pada Menit Ke-2: {kode_otp}", G)
                            time.sleep(2)
                            if d(className="android.widget.EditText").exists():
                                for edit_box in d(className="android.widget.EditText"):
                                    edit_box.click(); time.sleep(1); edit_box.clear_text(); time.sleep(1); edit_box.set_text(kode_otp); break
                                time.sleep(2)
                                clicked = False
                                btn_texts = ["Ok", "OK", "Selanjutnya", "Next", "Konfirmasi", "Confirm", "Submit"]
                                for btn in btn_texts:
                                    if d(className="android.widget.Button", textMatches=f"(?i).*{btn}.*").exists():
                                        d(className="android.widget.Button", textMatches=f"(?i).*{btn}.*").click(); clicked = True; break
                                    elif d(textMatches=f"(?i).*{btn}.*").exists():
                                        d(textMatches=f"(?i).*{btn}.*").click(); clicked = True; break
                                if not clicked: d.press("enter")
                                time.sleep(5)
                            update_activity()
                            break
                        
                log("[🔴 SIKLUS GAGAL] OTP tetap tidak muncul setelah resend & tunggu 1 menit lagi. Mengulang pendaftaran dari awal...", R)
                return False, target_id

        if is_stuck(): return False, target_id
        log("Menunggu proses pemuatan halaman akhir...")
        
        start_eval_wait = time.time()
        while time.time() - start_eval_wait < 15:
            klik_bahasa(d, ["Not now", "Lain kali", "Skip", "Lewati"], timeout=1)
            if d(textMatches="(?i).*(Prove you are human|Confirm you're human to use your account|Upload a profile picture|Find friends).*").exists(): break
            time.sleep(2)

        log("Mengeksekusi ekstraksi database UID...")
        uid = i(d, password_fb)

        if d(textMatches="(?i).*(Prove you are human|Confirm you're human to use your account).*").exists():
            if uid: log(f"[MATI/CHECKPOINT] {uid}|{password_fb}|{alamat_kontak}", R)
            else: log(f"[MATI/CHECKPOINT] Gagal Ekstrak UID|{password_fb}|{alamat_kontak}", R)
            return "CAPTCHA", target_id

        if uid:
            log(f"SUKSES! Akun hidup: {uid}|{password_fb}|{alamat_kontak}", G)
            simpan_hasil_akun(f"{uid}|{password_fb}|{alamat_kontak}") 
            return True, target_id
        else:
            log("Gagal menarik UID. Menyimpan kontak sebagai cadangan.", B)
            simpan_hasil_akun(f"{alamat_kontak}|{password_fb}") 
            return False, target_id

    except Exception as e:
        log(f"Terjadi Kesalahan UI: {e}", B)
        return False, target_id

def jalankan_otomatisasi_browser_baru(d, id_emu, target_id_awal, alamat_kontak_awal, password_fb, api_url, api_key, provider_name, service, country, provider_id=None, harga_lock=None):
    target_id = target_id_awal
    alamat_kontak = alamat_kontak_awal
    last_activity = time.time()
    last_state = None
    
    def update_activity():
        nonlocal last_activity
        last_activity = time.time()

    def set_state(state_name):
        nonlocal last_state
        if last_state != state_name:
            last_state = state_name
            update_activity()

    def is_stuck():
        return time.time() - last_activity > 60

    def log(pesan, warna=W):
        print(f"{warna}[{id_emu}] {pesan}{W}")

    nama_diketik = False
    usia_diketik = False
    gender_diklik = False
    nomor_diketik = False
    sandi_diketik = False
    otp_sudah_diisi = False
    start_otp_time = None
    resend_count = 0

    log("Memulai pendaftaran otomatis berbasis Kuncian State Machine...")
    
    while True:
        if is_stuck():
            log("[❌ STUCK] Terlalu lama di halaman yang sama atau layar blank (Batas 1 Menit Terlampaui)! Memicu pembersihan sesi murni...", R)
            eksekusi_clear_web_browser(d, log)
            time.sleep(15)
            return False, target_id

        # PRIORITY STATE 0: SENSOR PENANGKAP LIMIT MUTLAK
        if d(text="We couldn't create an account for you").exists() or d(textContains="We couldn't create").exists() or (d(text="OK").exists() and d(text="Agree to Facebook's terms and policies").exists()):
            set_state("LIMIT_DETECTED")
            log("[🔴 LIMIT DETECTED] Akun terkena limit pembuatan sistem Facebook!", R)
            if d(className="android.widget.Button", text="OK").exists():
                d(className="android.widget.Button", text="OK").click()
            elif d(text="OK").exists():
                d(text="OK").click()
            time.sleep(2)
            eksekusi_clear_web_browser(d, log)
            log("Jeda pemulihan limit 15 detik sebelum beralih nomor...", Y)
            time.sleep(15)
            return False, target_id

        # DETEKSI WEBPAGE ERROR (LANGSUNG REFRESH)
        if d(text="Webpage not available").exists() or d(textContains="net::ERR_").exists() or d(textContains="could not be loaded").exists() or d(textContains="ERR_UNKNOWN_URL_SCHEME").exists():
            set_state("WEB_ERROR")
            log("[🔴 WEB ERROR] Terdeteksi web error pada peramban! Langsung melakukan refresh...", R)
            if d(description="Refresh").exists():
                d(description="Refresh").click()
            elif d(description="refresh").exists():
                d(description="refresh").click()
            else:
                d.click(690, 72)
            time.sleep(3)
            continue

        # PRIORITY STATE 1: POP-UP PILIHAN RESEND
        if d(text="Resend code to SMS").exists() or d(text="Resend SMS").exists() or d(text="Kirim ulang SMS").exists():
            resend_count += 1
            set_state(f"RESEND_{resend_count}")
            log(f"Mendeteksi menu pop-up opsi pengiriman ulang. Mengklik 'Resend code to SMS' (Resend Ke-{resend_count})...", Y)
            if d(text="Resend code to SMS").exists():
                d(text="Resend code to SMS").click()
            elif d(text="Resend SMS").exists():
                d(text="Resend SMS").click()
            elif d(text="Kirim ulang SMS").exists():
                d(text="Kirim ulang SMS").click()
            start_otp_time = time.time()
            log(f"Menunggu SMS OTP Masuk Kembali (Masa Tunggu Menit Ke-{resend_count + 1})...")
            time.sleep(3)
            continue

        # SENSOR DETEKSI HALAMAN OTP MENGHILANG (PROSES SELESAI / COOKIES SIAP)
        if otp_sudah_diisi and not d(text="Enter the confirmation code").exists() and not d(textContains="confirmation code").exists() and not d(text="I didn't receive the code").exists() and not d(textMatches="(?i).*(didn't get the code|didn’t get the code).*").exists():
            set_state("GET_COOKIES")
            log("[🏆] Halaman OTP menghilang! Cookies siap diproses...", G)
            log("Mengklik tombol Get Cookies...", G)
            if d(description="get cookies fb").exists():
                d(description="get cookies fb").click()
            else:
                d.click(360, 1150)
            time.sleep(5)

            eksekusi_clear_web_browser(d, log)
            log("Pembersihan sesi selesai. Menunggu 15 detik agar aplikasi merender halaman login murni...", Y)
            time.sleep(15)
            return True, target_id

        # STATE 1: HALAMAN PEMBUKA / INTERSTITIAL REGISTRASI
        btn_awal = d(textMatches="(?i)^(Create new account|Get started|Mulai|Buat akun baru)$")
        if btn_awal.exists() and not d(text="What's your name?").exists():
            set_state("STATE_PEMBUKA")
            log(f"Mendeteksi Halaman Pembuka Registrasi. Mengklik {btn_awal.info.get('text')}...")
            btn_awal.click()
            time.sleep(3)
            continue

        # STATE 2: HALAMAN FORM NAMA
        if d(text="What's your name?").exists():
            set_state("STATE_NAMA")
            if not nama_diketik:
                log("Mendeteksi Halaman Form Nama. Memasukkan entitas acak...")
                nama_depan, nama_belakang = generate_nama_bule()
                edit_boxes = d(className="android.widget.EditText")
                if len(edit_boxes) >= 2:
                    edit_boxes[0].click(); edit_boxes[0].clear_text(); edit_boxes[0].set_text(nama_depan)
                    edit_boxes[1].click(); edit_boxes[1].clear_text(); edit_boxes[1].set_text(nama_belakang)
                elif len(edit_boxes) == 1:
                    edit_boxes[0].click(); edit_boxes[0].clear_text(); edit_boxes[0].set_text(f"{nama_depan} {nama_belakang}")
                nama_diketik = True
            if d(text="Next").exists(): d(text="Next").click()
            time.sleep(3)
            continue

        # STATE 3: HALAMAN FORM TANGGAL LAHIR
        if d(textMatches="(?i).*(What's your date of birth\?|What's your birthday\?).*").exists():
            set_state("STATE_DOB")
            log("Mendeteksi Halaman Tanggal Lahir. Mengeksekusi penekanan Next beruntun (2x)...")
            if d(text="Next").exists():
                d(text="Next").click()
                time.sleep(0.5)
            if d(text="Next").exists():
                d(text="Next").click()
            time.sleep(3)
            continue

        # STATE 4: POP-UP DIALOG KONFIRMASI USIA
        if d(textContains="You're setting your").exists():
            set_state("STATE_POPUP_USIA")
            log("Mendeteksi Pop-up Dialog Konfirmasi Usia. Mengklik OK...")
            if d(text="OK").exists(): d(text="OK").click()
            time.sleep(3)
            continue

        # STATE 5: HALAMAN FORM USIA
        if d(text="How old are you?").exists():
            set_state("STATE_USIA")
            if not usia_diketik:
                log("Mendeteksi Form Pengisian Usia.")
                umur_random = str(random.randint(18, 30))
                for edit_box in d(className="android.widget.EditText"):
                    edit_box.click(); edit_box.clear_text(); edit_box.set_text(umur_random); break
                usia_diketik = True
            if d(text="Next").exists(): d(text="Next").click()
            time.sleep(3)
            continue

        # STATE 6: HALAMAN FORM GENDER
        if d(text="What's your gender?").exists():
            set_state("STATE_GENDER")
            if not gender_diklik:
                log("Mendeteksi Form Pilihan Gender. Memilih Perempuan (Female)...")
                if d(text="Female").exists(): d(text="Female").click()
                gender_diklik = True
            if d(text="Next").exists(): d(text="Next").click()
            time.sleep(3)
            continue

        # STATE 7: HALAMAN FORM NOMOR HP
        if d(text="What's your mobile number?").exists():
            set_state("STATE_NOMOR")
            
            # Deteksi jika terdapat error bahwa nomor belum diisi
            if d(textContains="Mobile number required").exists():
                nomor_diketik = False

            kata_kunci_error = ["existing account", "associated with", "sudah terdaftar", "sudah ada akun", "telah digunakan", "recently used", "coba nomor lain", "disabled", "dinonaktifkan"]
            kontak_terpakai = False
            for err in kata_kunci_error:
                if d(textContains=err).exists(): kontak_terpakai = True; break
            
            if kontak_terpakai:
                log(f"[⚠️] Nomor ponsel {alamat_kontak} ditolak sistem! Mengambil nomor baru...", B)
                batalkan_nomor(api_url, api_key, target_id)
                nomor_diketik = False 
                
                for edit_box in d(className="android.widget.EditText"):
                    edit_box.click()
                    edit_box.clear_text()
                    time.sleep(0.5)
                    break
                    
                for _ in range(5):
                    tid, ak = beli_nomor(api_url, api_key, service, country, provider_name, provider_id, harga_lock)
                    if tid:
                        target_id, alamat_kontak = tid, ak; break
                    time.sleep(3)
                update_activity()
                continue

            if not nomor_diketik:
                log(f"Mendeteksi Form Nomor HP. Mengisi data kontak: {alamat_kontak}")
                kontak_input = alamat_kontak
                if not alamat_kontak.startswith("+"): kontak_input = "+" + alamat_kontak
                for edit_box in d(className="android.widget.EditText"):
                    edit_box.click(); edit_box.clear_text(); edit_box.set_text(kontak_input); break
                nomor_diketik = True
                update_activity()
                
            if d(text="Next").exists(): d(text="Next").click()
            time.sleep(3)
            continue

        # STATE 8: HALAMAN PEMBUATAN SANDI
        if d(text="Create a password").exists():
            set_state("STATE_PASSWORD")
            if not sandi_diketik:
                log("Mendeteksi Form Pembuatan Sandi Akun.")
                for edit_box in d(className="android.widget.EditText"):
                    edit_box.click(); edit_box.clear_text(); edit_box.set_text(password_fb); break
                sandi_diketik = True
            if d(text="Next").exists(): d(text="Next").click()
            time.sleep(3)
            continue

        # STATE 9: HALAMAN INFORMASI LOGIN
        if d(text="Save your login info?").exists():
            set_state("STATE_SAVE_INFO")
            log("Mendeteksi Halaman Retensi Informasi Akun. Mengklik Save...")
            if d(text="Save").exists(): d(text="Save").click()
            time.sleep(3)
            continue

        # STATE 10: HALAMAN KEBIJAKAN TERMS & POLICIES
        if d(textMatches="(?i).*(agree to Facebook's terms|read and agree to our terms|agree to our terms).*").exists() or d(text="I agree").exists() or d(text="Saya setuju").exists():
            set_state("STATE_TERMS")
            log("Mendeteksi Lembar Persetujuan Kebijakan Meta. Mengklik I agree...")
            if d(className="android.widget.Button", text="I agree").exists(): 
                d(className="android.widget.Button", text="I agree").click()
            elif d(className="android.widget.Button", text="Saya setuju").exists():
                d(className="android.widget.Button", text="Saya setuju").click()
            elif d(text="I agree").exists():
                d(text="I agree").click()
            elif d(text="Saya setuju").exists():
                d(text="Saya setuju").click()
            
            log("Menunggu respon persetujuan / deteksi limit aktif (Maksimal 10 detik)...")
            start_scan = time.time()
            kena_limit = False
            while time.time() - start_scan < 10:
                if d(textContains="We couldn't create").exists() or d(text="OK").exists() or d(text="Ok").exists():
                    kena_limit = True; break
                if d(text="Confirm your mobile number").exists() or d(textContains="confirmation code").exists() or d(text="Enter the confirmation code").exists():
                    break
                time.sleep(0.5)
                
            if kena_limit:
                log("[🔴 LIMIT DETECTED] Akun terkena limit pembuatan sistem Facebook!", R)
                if d(text="OK").exists(): d(text="OK").click()
                elif d(text="Ok").exists(): d(text="Ok").click()
                time.sleep(2)
                eksekusi_clear_web_browser(d, log)
                log("Jeda pemulihan limit 15 detik sebelum beralih nomor...", Y)
                time.sleep(15)
                return False, target_id

            continue

        # STATE 10.5: HALAMAN INTERSTITIAL JALUR OTP
        if d(text="Confirm your mobile number").exists():
            set_state("STATE_INTERSTITIAL_OTP")
            log("Mendeteksi Lembar Jalur Konfirmasi OTP. Mengunci opsi SMS...")
            if d(text="Send code via SMS, Carrier charges may apply").exists():
                d(text="Send code via SMS, Carrier charges may apply").click()
                time.sleep(1)
            elif d(text="Send code via SMS").exists():
                d(text="Send code via SMS").click()
                time.sleep(1)
            if d(text="Continue").exists():
                d(text="Continue").click()
            time.sleep(3)
            continue

        # STATE 11: HALAMAN INPUT VERIFIKASI KODE OTP
        if d(text="Enter the confirmation code").exists() or d(textContains="confirmation code").exists():
            set_state("STATE_OTP_INPUT")
            if otp_sudah_diisi:
                log("Menunggu halaman OTP menghilang pasca submit...")
                time.sleep(2)
                continue
                
            if start_otp_time is None:
                start_otp_time = time.time()
                log("Menunggu SMS OTP Masuk (Masa Tunggu Menit Ke-1)...")
            
            kode_otp = tunggu_otp(api_url, api_key, target_id, timeout=5)
            
            if kode_otp:
                log(f"[🟢] Kode OTP Didapat: {kode_otp}. Melakukan submit...", G)
                for box in d(className="android.widget.EditText"):
                    box.click(); box.clear_text(); box.set_text(kode_otp); break
                time.sleep(2)
                for btn in ["Next", "OK", "Ok", "Confirm", "Submit"]:
                    if d(text=btn).exists(): d(text=btn).click(); break
                otp_sudah_diisi = True
                start_otp_time = None
                update_activity()
                time.sleep(4)
                continue

            if time.time() - start_otp_time > 20:
                if resend_count < 2:
                    log(f"Waktu tunggu menit ke-{resend_count + 1} habis. Mengklik 'I didn't get the code'...", Y)
                    btn_no_code = d(textMatches="(?i).*(didn't get the code|didn’t get the code|didn't receive the code|didn’t receive the code|tidak mendapatkan kode).*")
                    if btn_no_code.exists():
                        btn_no_code.click()
                    elif d(textContains="get the code").exists():
                        d(textContains="get the code").click()
                    elif d(textContains="receive the code").exists():
                        d(textContains="receive the code").click()
                    time.sleep(3)
                    continue
                else:
                    log("[🔴] Batas waktu resend habis (Sudah 2x Resend tanpa OTP). Menggugurkan nomor...", R)
                    eksekusi_clear_web_browser(d, log)
                    log("Menunggu 15 detik pemulihan browser halaman utama...", Y)
                    time.sleep(15)
                    return False, target_id

        time.sleep(2)

def worker_emulator_fb_lite(serial_emu, password_fb, api_url, api_key, provider, service, negara, tipe_kontak, provider_id=None, harga_lock=None):
    global jumlah_worker_aktif
    gagal_beli_count = 0
    while True:
        print(f"\n{W}[{serial_emu}] === MEMULAI SIKLUS FB LITE BARU ==={W}")
        try:
            d = u2.connect(serial_emu)
            
            d.shell(f"am force-stop {NAMA_APK_LITE}")
            d.app_clear(NAMA_APK_LITE)
            d.app_start(NAMA_APK_LITE)
            time.sleep(4)
            
            print(f"{W}[{serial_emu}] Memesan {tipe_kontak} dari {provider}...{W}")
            if tipe_kontak == "email":
                target_id, alamat_kontak = beli_email(api_key, service)
            else:
                target_id, alamat_kontak = beli_nomor(api_url, api_key, service, negara, provider, provider_id, harga_lock)

            if not target_id:
                gagal_beli_count += 1
                if gagal_beli_count >= 2:
                    print(f"{R}[{serial_emu}] Gagal order total setelah dicoba kembali pasca jeda 30 detik. Menghentikan script worker emulator ini.{W}")
                    break
                print(f"{Y}[{serial_emu}] [!] Gagal mendapat kontak. Jeda 30 detik sebelum mencoba membelinya lagi...{W}")
                time.sleep(60)
                continue 

            gagal_beli_count = 0
            print(f"{W}[{serial_emu}] Berhasil mendapat {tipe_kontak}: {alamat_kontak}{W}")
            
            hasil, target_id_aktif = jalankan_otomatisasi_fb(d, serial_emu, target_id, alamat_kontak, password_fb, api_url, api_key, provider, service, negara, tipe_kontak, provider_id, harga_lock)
            
            if target_id_aktif:
                if hasil == True:
                    if tipe_kontak == "nomor":
                        selesaikan_nomor(api_url, api_key, target_id_aktif)
                else:
                    if tipe_kontak == "email":
                        batalkan_email(api_key, target_id_aktif)
                    else:
                        batalkan_nomor(api_url, api_key, target_id_aktif)
                
            print(f"{W}[{serial_emu}] SIKLUS SELESAI. Jeda Mandiri 30 Detik...{W}")
            try: d.app_clear(NAMA_APK_LITE)
            except Exception: pass
            time.sleep(30) 
            
        except Exception as e:
            print(f"{B}[{serial_emu}] Fatal Error / Emulator DC: {e}. Rekoneksi 15 detik...{W}")
            time.sleep(15)

    with counter_lock:
        jumlah_worker_aktif -= 1

def worker_emulator_lite_modif(serial_emu, password_fb, api_url, api_key, provider, service, negara, provider_id=None, harga_lock=None):
    global jumlah_worker_aktif
    gagal_beli_count = 0
    
    try:
        d = u2.connect(serial_emu)
        d.shell(f"am force-stop {NAMA_APK_MODIF}")
        d.app_start(NAMA_APK_MODIF)
        time.sleep(5)
    except Exception: pass

    while True:
        print(f"\n{W}[{serial_emu}] === SIKLUS APK BROWSER BARU ==={W}")
        try:
            d = u2.connect(serial_emu)
            
            print(f"{W}[{serial_emu}] Memesan nomor dari {provider}...{W}")
            target_id, alamat_kontak = beli_nomor(api_url, api_key, service, negara, provider, provider_id, harga_lock)

            if not target_id:
                gagal_beli_count += 1
                if gagal_beli_count >= 2:
                    print(f"{R}[{serial_emu}] Gagal order nomor total setelah dicoba kembali pasca jeda 30 detik. Menghentikan script worker emulator ini.{W}")
                    break
                print(f"{Y}[{serial_emu}] [!] Gagal mendapat nomor. Jeda 30 detik sebelum mencoba membelinya lagi...{W}")
                time.sleep(30)
                continue 

            gagal_beli_count = 0
            print(f"{G}[{serial_emu}] Berhasil mendapat nomor: {alamat_kontak}{W}")

            log_res, target_id_aktif = jalankan_otomatisasi_browser_baru(d, serial_emu, target_id, alamat_kontak, password_fb, api_url, api_key, provider, service, negara, provider_id, harga_lock)
            
            if target_id_aktif:
                if log_res:
                    selesaikan_nomor(api_url, api_key, target_id_aktif)
                else:
                    batalkan_nomor(api_url, api_key, target_id_aktif)
            
            print(f"{W}[{serial_emu}] Pembersihan sesi sukses murni. Memutar ke antrean nomor berikutnya...{W}")
            
        except Exception as e:
            print(f"{R}[{serial_emu}] Gangguan Sistem Siklus: {e}. Melakukan penyelarasan peramban...{W}")
            try:
                d.shell(f"am force-stop {NAMA_APK_MODIF}")
                d.app_start(NAMA_APK_MODIF)
                time.sleep(5)
            except Exception: pass
            time.sleep(15)

    with counter_lock:
        jumlah_worker_aktif -= 1

def main():
    global jumlah_worker_aktif
    print(f"\n{G}╔══════════════════════════════════════════════════════╗{W}")
    print(f"{G}║         BOT AUTOMATION PANEL MASTER ENGINE V12       ║{G}")
    print(f"{G}║             MULTI-MODE: FB LITE & TES APK BROWSER    ║{G}")
    print(f"{G}╚══════════════════════════════════════════════════════╝{W}\n")
    
    daftar_emulator = dapatkan_perangkat_adb()
    if not daftar_emulator: sys.exit(f"{B}[SISTEM] Tidak ada emulator terdeteksi.{W}")
    print(f"{G}[SISTEM] Terdeteksi {len(daftar_emulator)} emulator aktif.{W}")
    
    api_tersimpan = muat_api_tersimpan()
    api_hidup = {}
    for p, key in list(api_tersimpan.items()):
        if p not in DATA_PROVIDER: continue
        api_hidup[p] = key
        url_cek = DATA_PROVIDER[p]['url'] if p != "SMSBower" else DATA_PROVIDER['SMSBower']['url_sms']
        cek_status_api(url_cek, key)
    
    daftar_provider = list(DATA_PROVIDER.keys())
    for i, p in enumerate(daftar_provider): print(f"[{i+1}] {p}")
    provider = daftar_provider[int(input(f"\nPilih API Provider: ").strip()) - 1]
    
    api_key = api_hidup.get(provider) or input(f"Masukkan API Key {provider}: ").strip()
    simpan_api(provider, api_key)

    tipe_kontak = "nomor"
    negara = None 
    if provider == "SMSBower":
        print(f"\n{C}── METODE KONTAK (HANYA BERLAKU UNTUK FB LITE) ──{W}")
        print(f"{W}[1] Via Nomor HP\n[2] Via Gmail")
        if input("Pilih metode: ").strip() == "2": tipe_kontak = "email"

    url_sms_api = DATA_PROVIDER[provider]['url'] if provider != "SMSBower" else DATA_PROVIDER['SMSBower']['url_sms']
    provider_id_kunci, harga_kunci = None, None

    if tipe_kontak == "nomor":
        data_negara = ambil_daftar_negara_api(url_sms_api, api_key)
        if data_negara:
            negara = input_negara_pintar(data_negara)
        else:
            negara = "6"

        if provider in ["SMSBower", "SMSCode"]:
            pilihan_harga = tampilkan_dan_pilih_rank(api_key, negara, provider)
            if pilihan_harga:
                provider_id_kunci = pilihan_harga['provider_id']
                harga_kunci       = pilihan_harga['price']

    print(f"\n{C}╔══════════════════════════════════════════════════════╗{W}")
    print(f"{C}║               PILIH TARGET EKSEKUSI BOT              ║{W}")
    print(f"{C}╠══════════════════════════════════════════════════════╣{W}")
    print(f"{W}  [1] FB Lite Biasa (Script 1 — Dengan Perbaikan Resend){W}")
    print(f"{W}  [2] Tes APK Browser (Script 2 — Cookie & Clear Web)   {W}")
    print(f"{C}╚══════════════════════════════════════════════════════╝{W}")
    
    pilihan_app = input(f"\n{W}  Masukkan Pilihan Mode (1 atau 2): {W}").strip()
    
    if pilihan_app == "1":
        for serial in daftar_emulator:
            try:
                d_bg = u2.connect(serial)
                threading.Thread(target=penjaga_latar_belakang, args=(d_bg,), daemon=True).start()
            except Exception: pass

    password_fb = "kontol87" 
    jumlah_worker_aktif = len(daftar_emulator)

    try:
        print(f"\n{Y}========================================================")
        print(f"[SISTEM] Memulai Multi-Thread")
        print(f"========================================================{W}\n")
        
        threads = []
        for serial in daftar_emulator:
            if pilihan_app == "1":
                t = threading.Thread(target=worker_emulator_fb_lite, args=(
                    serial, password_fb, url_sms_api, api_key, provider, 
                    DATA_PROVIDER[provider]['service'], negara, tipe_kontak, 
                    provider_id_kunci, harga_kunci
                ))
                threads.append(t)
                t.daemon = True
                t.start()
                time.sleep(15)
            else:
                t = threading.Thread(target=worker_emulator_lite_modif, args=(
                    serial, password_fb, url_sms_api, api_key, provider, 
                    DATA_PROVIDER[provider]['service'], negara, provider_id_kunci, harga_kunci
                ))
                threads.append(t)
                t.daemon = True
                t.start()
                time.sleep(60)
        
        while True: time.sleep(1)
            
    except KeyboardInterrupt: sys.exit()

if __name__ == "__main__":
    main()