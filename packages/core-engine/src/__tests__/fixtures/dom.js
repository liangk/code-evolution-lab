function renderList(items) {
  const list = document.getElementById('list');
  for (const item of items) {
    const li = document.createElement('li');
    list.appendChild(li);
  }
}

function renderProfile(req, container) {
  container.innerHTML = `<div>${req.body.bio}</div>`;
}

document.write('<h1>Loading...</h1>');
