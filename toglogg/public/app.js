(function () {
  var lokTyper = ['El 14', 'El 15', 'El 16', 'El 17', 'El 18', 'Di 3', 'Di 4', 'Di 6', 'Di 8', 'Di 9', 'Rc', 'Iore', 'Euro 4000', 'Vectron', 'CD 66'];
  var motorvognTyper = ['BM 69', 'BM 70', 'BM 71', 'BM 72', 'BM 73', 'BM 74', 'BM 75', 'BM 76', 'BM 92', 'BM 93', 'Flirt', 'Talent 3'];

  var bilder = [];
  var aktivKategori = 'alle';
  var aktivType = 'alle';
  var valgtKategoriForm = null;
  var valgtBildeId = null;
  var valgtDataUrl = null;
  var authMode = 'login';

  var authScreen = document.getElementById('authScreen');
  var appScreen = document.getElementById('appScreen');

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    opts.credentials = 'same-origin';
    return fetch('/api' + path, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Noe gikk galt.');
        return data;
      });
    });
  }

  // ---------- Autentisering ----------

  function visApp(bruker) {
    document.getElementById('whoami').textContent = bruker.username;
    authScreen.style.display = 'none';
    appScreen.style.display = 'block';
    lastInnBilder();
  }

  function visAuth() {
    authScreen.style.display = 'block';
    appScreen.style.display = 'none';
  }

  function sjekkInnlogging() {
    api('/auth/me')
      .then(function (data) { visApp(data.user); })
      .catch(function () { visAuth(); });
  }

  document.querySelectorAll('.auth-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.auth-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      authMode = tab.getAttribute('data-mode');
      document.getElementById('authSubmit').textContent = authMode === 'login' ? 'Logg inn' : 'Opprett bruker';
      document.getElementById('authError').style.display = 'none';
    });
  });

  document.getElementById('authForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var username = document.getElementById('usernameInput').value.trim();
    var password = document.getElementById('passwordInput').value;
    var errBox = document.getElementById('authError');
    errBox.style.display = 'none';

    var endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
    api(endpoint, { method: 'POST', body: JSON.stringify({ username: username, password: password }) })
      .then(function (data) { visApp(data.user); })
      .catch(function (err) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
      });
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    api('/auth/logout', { method: 'POST' }).finally(function () {
      bilder = [];
      visAuth();
    });
  });

  // ---------- Bilder ----------

  function lastInnBilder() {
    api('/photos')
      .then(function (data) {
        bilder = data.bilder;
        oppdaterTypeFilter();
        oppdaterStats();
        renderGrid();
      })
      .catch(function () {
        bilder = [];
        renderGrid();
      });
  }

  function oppdaterTypeFilter() {
    var kilde = bilder;
    if (aktivKategori !== 'alle') {
      kilde = bilder.filter(function (b) { return b.kategori === aktivKategori; });
    }
    var typer = [];
    kilde.forEach(function (b) {
      if (b.type && typer.indexOf(b.type) === -1) typer.push(b.type);
    });
    typer.sort();
    var sel = document.getElementById('typeFilter');
    var forrige = sel.value;
    sel.innerHTML = '<option value="alle">Alle typer</option>';
    typer.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t;
      o.textContent = t;
      sel.appendChild(o);
    });
    if (typer.indexOf(forrige) !== -1) {
      sel.value = forrige;
      aktivType = forrige;
    } else {
      sel.value = 'alle';
      aktivType = 'alle';
    }
  }

  function oppdaterStats() {
    document.getElementById('statTotal').textContent = bilder.length;
    document.getElementById('statLok').textContent = bilder.filter(function (b) { return b.kategori === 'Lok'; }).length;
    document.getElementById('statMotorvogn').textContent = bilder.filter(function (b) { return b.kategori === 'Motorvogn'; }).length;
  }

  function formatDato(iso) {
    var deler = (iso || '').split('-');
    if (deler.length !== 3) return iso || '';
    return deler[2] + '.' + deler[1] + '.' + deler[0];
  }

  function renderGrid() {
    var area = document.getElementById('gridArea');
    var liste = bilder.slice().sort(function (a, b) { return b.opprettet - a.opprettet; });
    if (aktivKategori !== 'alle') liste = liste.filter(function (b) { return b.kategori === aktivKategori; });
    if (aktivType !== 'alle') liste = liste.filter(function (b) { return b.type === aktivType; });

    if (liste.length === 0) {
      var overskrift = bilder.length === 0 ? 'Ingen bilder ennå' : 'Ingen treff';
      var tekst = bilder.length === 0
        ? 'Legg til det første bildet av et lok eller en motorvogn.'
        : 'Prøv en annen kategori eller type.';
      area.innerHTML = '<div class="empty"><h3>' + overskrift + '</h3><p>' + tekst + '</p></div>';
      return;
    }

    var grid = document.createElement('div');
    grid.className = 'grid';
    liste.forEach(function (b) {
      var card = document.createElement('div');
      card.className = 'card';
      card.addEventListener('click', function () { visBilde(b.id); });

      var thumb = document.createElement('div');
      thumb.className = 'thumb';
      var img = document.createElement('img');
      img.src = b.dataUrl;
      img.alt = b.tittel;
      thumb.appendChild(img);

      var info = document.createElement('div');
      info.className = 'info';
      var badge = document.createElement('span');
      badge.className = 'badge ' + (b.kategori === 'Lok' ? 'lok' : 'motorvogn');
      badge.textContent = b.kategori + (b.type ? ' · ' + b.type : '');

      var tittel = document.createElement('div');
      tittel.className = 'tittel';
      tittel.textContent = b.tittel;

      var meta = document.createElement('div');
      meta.className = 'meta';
      var metaDeler = [];
      if (b.kode) metaDeler.push(b.kode);
      if (b.sted) metaDeler.push(b.sted);
      if (b.dato) metaDeler.push(formatDato(b.dato));
      meta.textContent = metaDeler.join(' · ');

      info.appendChild(badge);
      info.appendChild(tittel);
      info.appendChild(meta);
      card.appendChild(thumb);
      card.appendChild(info);
      grid.appendChild(card);
    });
    area.innerHTML = '';
    area.appendChild(grid);
  }

  function visBilde(id) {
    var b = bilder.find(function (x) { return x.id === id; });
    if (!b) return;
    valgtBildeId = id;
    document.getElementById('viewImg').src = b.dataUrl;
    document.getElementById('viewImg').alt = b.tittel;
    var badge = document.getElementById('viewBadge');
    badge.className = 'badge ' + (b.kategori === 'Lok' ? 'lok' : 'motorvogn');
    badge.textContent = b.kategori + (b.type ? ' · ' + b.type : '');
    document.getElementById('viewTitle').textContent = b.tittel;
    var metaDeler = [];
    if (b.kode) metaDeler.push(b.kode);
    if (b.sted) metaDeler.push(b.sted);
    if (b.dato) metaDeler.push(formatDato(b.dato));
    document.getElementById('viewMeta').textContent = metaDeler.join(' · ');
    document.getElementById('viewNote').textContent = b.notat || '';
    document.getElementById('viewOverlay').classList.add('show');
  }

  function lukkVis() {
    document.getElementById('viewOverlay').classList.remove('show');
    valgtBildeId = null;
  }

  document.getElementById('closeView').addEventListener('click', lukkVis);
  document.getElementById('viewOverlay').addEventListener('click', function (e) { if (e.target === this) lukkVis(); });

  document.getElementById('deleteBtn').addEventListener('click', function () {
    if (!valgtBildeId) return;
    var id = valgtBildeId;
    api('/photos/' + id, { method: 'DELETE' })
      .then(function () {
        bilder = bilder.filter(function (b) { return b.id !== id; });
        lukkVis();
        oppdaterTypeFilter();
        oppdaterStats();
        renderGrid();
      })
      .catch(function (err) { alert(err.message); });
  });

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      aktivKategori = tab.getAttribute('data-kat');
      oppdaterTypeFilter();
      renderGrid();
    });
  });

  document.getElementById('typeFilter').addEventListener('change', function () {
    aktivType = this.value;
    renderGrid();
  });

  function oppdaterDatalist() {
    var dl = document.getElementById('typeSuggestions');
    dl.innerHTML = '';
    var kilde = valgtKategoriForm === 'Lok' ? lokTyper : (valgtKategoriForm === 'Motorvogn' ? motorvognTyper : []);
    kilde.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t;
      dl.appendChild(o);
    });
  }

  document.querySelectorAll('.cat-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.cat-btn').forEach(function (b) { b.classList.remove('sel'); });
      btn.classList.add('sel');
      valgtKategoriForm = btn.getAttribute('data-kat');
      oppdaterDatalist();
    });
  });

  // Komprimerer bildet i nettleseren før opplasting, slik at det ikke blir for stort.
  function komprimerBilde(fil, maxBredde) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function (ev) {
        var image = new Image();
        image.onerror = reject;
        image.onload = function () {
          var skala = Math.min(1, maxBredde / image.width);
          var bredde = Math.round(image.width * skala);
          var hoyde = Math.round(image.height * skala);
          var canvas = document.createElement('canvas');
          canvas.width = bredde;
          canvas.height = hoyde;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, 0, bredde, hoyde);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        image.src = ev.target.result;
      };
      reader.readAsDataURL(fil);
    });
  }

  document.getElementById('fileInput').addEventListener('change', function (e) {
    var fil = e.target.files[0];
    if (!fil) return;
    komprimerBilde(fil, 1280).then(function (dataUrl) {
      valgtDataUrl = dataUrl;
      var prev = document.getElementById('previewImg');
      prev.src = valgtDataUrl;
      prev.style.display = 'block';
      document.getElementById('fileError').style.display = 'none';
    });
  });

  function apneAdd() { document.getElementById('addOverlay').classList.add('show'); }
  function lukkAdd() {
    document.getElementById('addOverlay').classList.remove('show');
    document.getElementById('addForm').reset();
    document.getElementById('previewImg').style.display = 'none';
    document.querySelectorAll('.cat-btn').forEach(function (b) { b.classList.remove('sel'); });
    valgtKategoriForm = null;
    valgtDataUrl = null;
    document.getElementById('fileError').style.display = 'none';
    document.getElementById('tittelError').style.display = 'none';
    document.getElementById('saveError').style.display = 'none';
    oppdaterDatalist();
  }

  document.getElementById('addBtn').addEventListener('click', apneAdd);
  document.getElementById('closeAdd').addEventListener('click', lukkAdd);
  document.getElementById('cancelAdd').addEventListener('click', lukkAdd);
  document.getElementById('addOverlay').addEventListener('click', function (e) { if (e.target === this) lukkAdd(); });

  document.getElementById('addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var feil = false;
    if (!valgtDataUrl) {
      document.getElementById('fileError').style.display = 'block';
      feil = true;
    }
    var tittel = document.getElementById('tittelInput').value.trim();
    if (!tittel) {
      document.getElementById('tittelError').style.display = 'block';
      feil = true;
    } else {
      document.getElementById('tittelError').style.display = 'none';
    }
    if (feil) return;

    var saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Lagrer …';

    api('/photos', {
      method: 'POST',
      body: JSON.stringify({
        dataUrl: valgtDataUrl,
        tittel: tittel,
        kategori: valgtKategoriForm || 'Lok',
        type: document.getElementById('typeInput').value.trim(),
        kode: document.getElementById('kodeInput').value.trim(),
        sted: document.getElementById('stedInput').value.trim(),
        dato: document.getElementById('datoInput').value,
        notat: document.getElementById('notatInput').value.trim(),
      }),
    })
      .then(function (data) {
        bilder.push(data.bilde);
        lukkAdd();
        oppdaterTypeFilter();
        oppdaterStats();
        renderGrid();
      })
      .catch(function (err) {
        var errBox = document.getElementById('saveError');
        errBox.textContent = err.message;
        errBox.style.display = 'block';
      })
      .finally(function () {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Lagre bilde';
      });
  });

  sjekkInnlogging();
})();
