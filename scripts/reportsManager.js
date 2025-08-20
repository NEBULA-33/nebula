import { state } from './dataManager.js';
import { renderReportTable, renderReportChart, clearReportDisplay } from './uiManager.js';
import { supabase } from './supabaseClient.js';
import { getCurrentRole } from './authManager.js';

let uiElements;
let activeReportGenerator = null; // Aktif rapor fonksiyonunu hafızada tutmak için

// Raporlar için gerekli olan tüm verileri tek seferde ve doğru şekilde çeken ana fonksiyon
async function fetchAllReportData() {
    const shopSelect = document.getElementById('report-shop-select');
    if (!shopSelect) return {};

    const selectedShopId = shopSelect.value;
    
    const tablesToFetch = [
        'sales', 'wastage_history', 'return_history', 
        'butchering_history', 'stock_in_history', 'audit_log'
    ];

    const queries = tablesToFetch.map(tableName => {
        let query = supabase.from(tableName).select('*');
        if (selectedShopId !== 'all') {
            query = query.eq('shop_id', selectedShopId);
        }
        return query;
    });

    const results = await Promise.all(queries);
    const reportData = {};

    results.forEach((result, index) => {
        const tableName = tablesToFetch[index];
        if (result.error) {
            console.error(`${tableName} verisi çekilirken hata:`, result.error);
            reportData[tableName] = [];
        } else {
            reportData[tableName] = result.data || [];
        }
    });

    // Ürünler, dükkan filtresine göre ayrı çekilir
    let productQuery = supabase.from('products').select('*');
    if (selectedShopId !== 'all') {
        productQuery = productQuery.eq('shop_id', selectedShopId);
    }
    const { data: productsData, error: productsError } = await productQuery;
    if (productsError) {
        console.error("Ürünler çekilirken hata:", productsError);
        reportData.products = [];
    } else {
        reportData.products = productsData || [];
    }

    return reportData;
}

// --- RAPOR OLUŞTURMA FONKSİYONLARI (İÇLERİ ŞİMDİLİK BOŞ) ---

async function generateCiroKarReport() {
    activeReportGenerator = generateCiroKarReport;
    renderReportTable('Dönemsel Ciro ve Kâr', [], [], '<p>Bu raporun içeriği yakında eklenecek.</p>');
}

async function generateKanalSatisRaporu() {
    activeReportGenerator = generateKanalSatisRaporu;
    renderReportTable('Satış Kanalı Performansı', [], [], '<p>Bu raporun içeriği yakında eklenecek.</p>');
}

async function generateSaatlikSatis() {
    activeReportGenerator = generateSaatlikSatis;
    renderReportTable('Saatlik Satış Yoğunluğu', [], [], '<p>Bu raporun içeriği yakında eklenecek.</p>');
}

// ... Diğer tüm rapor fonksiyonları için benzer boş şablonlar ...
async function generateGunSonu() {
    activeReportGenerator = generateGunSonu;
    const contentHTML = `<div class="form-group"><label for="gun-sonu-date">Rapor Tarihi Seçin:</label><input type="date" id="gun-sonu-date" value="${new Date().toISOString().split('T')[0]}"></div><div id="gun-sonu-summary"></div>`;
    renderReportTable('Gün Sonu Özeti', [], [], contentHTML);
    
    const dateInput = document.getElementById('gun-sonu-date');
    const summaryDiv = document.getElementById('gun-sonu-summary');
    
    // Veriyi Supabase'den dükkan filtresine uygun olarak çek
    const { sales } = await fetchAllReportData();

    const showSummary = (dateStr) => {
        if (!sales) {
            summaryDiv.innerHTML = '<p>Satış verisi bulunamadı.</p>';
            return;
        }
        const selectedDate = new Date(dateStr);
        const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999));

        const salesToday = sales.filter(s => {
            const saleDate = new Date(s.created_at); // Veritabanındaki created_at kullanılıyor
            return saleDate >= startOfDay && saleDate <= endOfDay;
        });

        const totalRevenue = salesToday.filter(s => s.quantity > 0).reduce((sum, s) => sum + (s.total_revenue || 0), 0);
        const totalProfit = salesToday.filter(s => s.quantity > 0).reduce((sum, s) => sum + ((s.total_revenue || 0) - (s.purchase_price || 0) * (s.quantity || 0)), 0);
        const totalReturns = salesToday.filter(s => s.quantity < 0).reduce((sum, s) => sum + Math.abs(s.total_revenue || 0), 0);

        summaryDiv.innerHTML = `
            <div class="summary-metrics">
                <div>Toplam Ciro: <span>${totalRevenue.toFixed(2)} TL</span></div>
                <div>Toplam Kâr: <span>${totalProfit.toFixed(2)} TL</span></div>
                <div>Toplam İade: <span>${totalReturns.toFixed(2)} TL</span></div>
            </div>`;
    };

    dateInput.addEventListener('change', (e) => showSummary(e.target.value));
    showSummary(dateInput.value); // Sayfa ilk yüklendiğinde bugünün özetini göster
}
async function generateFireReport() {
    activeReportGenerator = generateFireReport;
    
    // Veriyi Supabase'den dükkan filtresine uygun olarak çek
    const { wastage_history } = await fetchAllReportData();
    
    if (!wastage_history || wastage_history.length === 0) {
        return renderReportTable('Fire/Zayiat Raporu', [], [], '<p>Seçili filtre için zayiat kaydı bulunamadı.</p>');
    }
    
    const headers = ['Tarih', 'Ürün Adı', 'Miktar', 'Neden', 'Maliyet'];
    const rows = wastage_history
        .sort((a,b) => new Date(b.created_at) - new Date(a.created_at)) // En yeniden eskiye sırala
        .map(log => [ 
            new Date(log.created_at).toLocaleString('tr-TR'), 
            log.product_name, 
            log.quantity, 
            log.reason, 
            `${(log.cost || 0).toFixed(2)} TL`
        ]);

    renderReportTable('Fire/Zayiat Raporu', headers, rows);
}

async function generateEnCokSatanReport() {
    activeReportGenerator = generateEnCokSatanReport;
    
    const { sales, products } = await fetchAllReportData();
    
    if (!sales || sales.length === 0) {
        return renderReportTable('En Çok Satan Ürünler (Ciroya Göre)', [], [], '<p>Seçili filtre için satış kaydı bulunamadı.</p>');
    }

    const productSales = {};
    sales.forEach(sale => {
        if((sale.quantity || 0) > 0) { // Sadece satışları say, iadeleri hariç tut
            productSales[sale.product_id] = (productSales[sale.product_id] || 0) + (sale.total_revenue || 0);
        }
    });

    const sortedProducts = Object.entries(productSales)
        .sort(([,a],[,b]) => b - a) // Ciroya göre çoktan aza sırala
        .slice(0, 20); // İlk 20 ürünü al

    const headers = ['#', 'Ürün Adı', 'Toplam Ciro'];
    const rows = sortedProducts.map(([productId, totalRevenue], index) => {
        const product = products.find(p => p.id == productId);
        return [index + 1, product ? product.name : `Silinmiş Ürün (ID: ${productId})`, `${totalRevenue.toFixed(2)} TL`];
    });

    renderReportTable('En Çok Satan Ürünler (Ciroya Göre)', headers, rows);
}

async function generateEnAzSatanReport() {
    activeReportGenerator = generateEnAzSatanReport;
    
    const { sales, products } = await fetchAllReportData();
    
    if (!products || products.length === 0) {
        return renderReportTable('En Az Satan Ürünler', [], [], '<p>Seçili filtre için ürün bulunamadı.</p>');
    }

    const productSalesCount = {};
    // Her ürünü başlangıçta 0 satışla listeye ekle
    products.forEach(p => productSalesCount[p.id] = 0);

    // Satışları say
    sales.forEach(sale => {
        if((sale.quantity || 0) > 0) {
            productSalesCount[sale.product_id] += (sale.quantity || 0);
        }
    });

    const sortedProducts = Object.entries(productSalesCount)
        .sort(([,a],[,b]) => a - b) // Satış miktarına göre azdan çoğa sırala
        .slice(0, 20); // En az satan ilk 20 ürünü al

    const headers = ['#', 'Ürün Adı', 'Satış Miktarı'];
    const rows = sortedProducts.map(([productId, count], index) => {
        const product = products.find(p => p.id == productId);
        return [index + 1, product ? product.name : `Silinmiş Ürün (ID: ${productId})`, product ? count.toFixed(product.is_weighable ? 3 : 0) : count];
    });

    renderReportTable('En Az Satan Ürünler', headers, rows);
}
// --- ANA YÖNETİM FONKSİYONLARI (İSKELET) ---

function handleReportCardClick(e) {
    const card = e.target.closest('.report-card');
    if (!card) return;
    const reportId = card.dataset.reportId;
    if (!reportId) return;

    uiElements.reportHub.style.display = 'none';
    uiElements.reportDisplay.style.display = 'block';

    const reportFunctions = {
        'ciroKar': generateCiroKarReport,
        'kanalSatis': generateKanalSatisRaporu,
        'saatlikSatis': generateSaatlikSatis,
        'gunSonu': generateGunSonu,
        'fireZayiat': generateFireReport,
        'enCokSatan': generateEnCokSatanReport,
        'enCokKar': generateEnCokKarReport,
        'enAzSatan': generateEnAzSatanReport,
        'karMarji': generateKarMarjiRaporu,
        // Diğer tüm rapor id'leri buraya eklenecek
    };

    if (reportFunctions[reportId]) {
        reportFunctions[reportId]();
    } else {
        renderReportTable(`Rapor: ${reportId}`, [], [], '<p>Bu rapor henüz yapılandırılmamıştır.</p>');
        activeReportGenerator = () => renderReportTable(`Rapor: ${reportId}`, [], [], '<p>Bu rapor henüz yapılandırılmamıştır.</p>');
    }
}

function backToHub() {
    uiElements.reportDisplay.style.display = 'none';
    uiElements.reportHub.style.display = 'block';
    clearReportDisplay();
    activeReportGenerator = null;
}

async function populateShopSelect() {
    const shopSelect = document.getElementById('report-shop-select');
    const filtersContainer = document.getElementById('report-filters-container');
    if (!shopSelect || !filtersContainer) return;

    const role = getCurrentRole();
    if (role !== 'yönetici' && role !== 'manager') {
        filtersContainer.style.display = 'none';
        return;
    }
    filtersContainer.style.display = 'block';

    const { data: shops, error } = await supabase.from('shops').select('*');
    if (error) return console.error("Dükkanlar çekilemedi:", error);

    const currentShopOption = state.currentShop ? `<option value="${state.currentShop.id}">Sadece Bu Dükkan (${state.currentShop.name})</option>` : '';

    shopSelect.innerHTML = `
        ${currentShopOption}
        <option value="all">Tüm Dükkanlar (Genel Bakış)</option>
        ${(shops || []).filter(s => state.currentShop && s.id !== state.currentShop.id).map(shop => `<option value="${shop.id}">${shop.name}</option>`).join('')}
    `;
}

function onShopSelectionChange() {
    if (activeReportGenerator) {
        activeReportGenerator();
    }
}

export function initializeReportsManager(elements) {
    uiElements = elements;
    if(uiElements.reportHub) uiElements.reportHub.addEventListener('click', handleReportCardClick);
    if(uiElements.backToHubBtn) uiElements.backToHubBtn.addEventListener('click', backToHub);

    const shopSelect = document.getElementById('report-shop-select');
    if(shopSelect) {
        shopSelect.addEventListener('change', onShopSelectionChange);
    }

    const reportsTabButton = document.querySelector('button[data-tab="reports"]');
    if (reportsTabButton) {
        reportsTabButton.addEventListener('click', populateShopSelect);
    }
    
    if(document.querySelector('.tab-btn[data-tab="reports"].active')) {
        populateShopSelect();
    }
}